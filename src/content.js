// Content script for GCal popup detection and sidecar injection

let currentSidecar = null;

function detectPopup() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const popup = findQuickCreatePopup(node);
        if (popup && !currentSidecar) {
          injectSidecar(popup);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function findQuickCreatePopup(node) {
  // Strategy 1: look for data-eventid attribute (GCal uses this on event elements)
  if (node.matches && node.matches('[data-eventid]')) return node;
  const found = node.querySelector && node.querySelector('[data-eventid]');
  if (found) return found;

  // Strategy 2: look for the bubble that contains "Save" and "More options"
  const buttons = node.querySelectorAll && node.querySelectorAll('button');
  if (buttons) {
    for (const btn of buttons) {
      if (btn.textContent.trim() === 'Save') {
        let container = btn.closest('[role="dialog"], [data-eventid]');
        if (container) return container;
        container = btn.parentElement;
        while (container && container !== document.body) {
          if (container.offsetWidth > 200 && container.offsetHeight > 100) {
            return container;
          }
          container = container.parentElement;
        }
      }
    }
  }
  return null;
}

function extractTimeFromPopup(popup) {
  const allText = popup.innerText;
  const timePattern = /(\d{1,2}(?::\d{2})?(?:am|pm)?)\s*[–\-]\s*(\d{1,2}(?::\d{2})?(?:am|pm)?)/i;
  const match = allText.match(timePattern);

  if (match) {
    return parseTimeRange(match[0]);
  }

  return null;
}

function parseTimeRange(timeText) {
  const timePattern = /(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s*[–\-]\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)?/i;
  const match = timeText.match(timePattern);
  if (!match) return null;

  let [, startRaw, startMeridiem, endRaw, endMeridiem] = match;

  // If only end has am/pm, infer start meridiem.
  // GCal omits start meridiem when it's the same as end, e.g. "10:00 – 11:00am"
  // But for cross-meridiem ranges like "11:00 – 1:00pm", start should be am.
  if (!startMeridiem && endMeridiem) {
    const tentativeStart = toMinutes(startRaw, endMeridiem);
    const endMinutes = toMinutes(endRaw, endMeridiem);
    if (tentativeStart > endMinutes) {
      startMeridiem = endMeridiem.toLowerCase() === 'pm' ? 'am' : 'pm';
    } else {
      startMeridiem = endMeridiem;
    }
  }
  if (!startMeridiem) startMeridiem = 'am'; // fallback

  const startTime = toMinutes(startRaw, startMeridiem);
  const endTime = toMinutes(endRaw, endMeridiem || startMeridiem);

  const dateStr = extractDateFromPopup();
  const date = dateStr ? new Date(dateStr) : new Date();
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  const start = new Date(year, month, day, Math.floor(startTime / 60), startTime % 60);
  const end = new Date(year, month, day, Math.floor(endTime / 60), endTime % 60);

  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

function toMinutes(raw, meridiem) {
  let [hours, minutes] = raw.includes(':') ? raw.split(':').map(Number) : [Number(raw), 0];
  meridiem = (meridiem || '').toLowerCase();
  if (meridiem === 'pm' && hours !== 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function extractDateFromPopup() {
  const headers = document.querySelectorAll('[data-datekey]');
  const selected = document.querySelector('.yDmH0d[data-datekey]');
  if (selected) {
    const dateKey = selected.getAttribute('data-datekey');
    if (dateKey && dateKey.length === 8) {
      const y = dateKey.substring(0, 4);
      const m = dateKey.substring(4, 6);
      const d = dateKey.substring(6, 8);
      return `${y}-${m}-${d}`;
    }
  }
  return null;
}

function injectSidecar(popup) {
  chrome.storage.sync.get({ projects: [], calendarId: '' }, ({ projects, calendarId }) => {
    if (projects.length === 0) return;

    const sidecar = document.createElement('div');
    sidecar.id = 'gcal-tracker-sidecar';

    const header = document.createElement('div');
    header.className = 'gcal-tracker-header';
    header.textContent = 'Quick Track';
    sidecar.appendChild(header);

    if (!calendarId) {
      const warning = document.createElement('div');
      warning.className = 'gcal-tracker-warning';
      warning.textContent = 'Set a calendar in extension options';
      sidecar.appendChild(warning);
    }

    projects.forEach(project => {
      const btn = document.createElement('button');
      btn.className = 'gcal-tracker-btn';
      btn.textContent = project;
      btn.addEventListener('click', () => handleProjectClick(project, popup, calendarId));
      sidecar.appendChild(btn);
    });

    positionSidecar(sidecar, popup);
    document.body.appendChild(sidecar);
    currentSidecar = sidecar;

    const cleanupObserver = new MutationObserver(() => {
      if (!document.body.contains(popup)) {
        removeSidecar();
        cleanupObserver.disconnect();
      }
    });
    cleanupObserver.observe(document.body, { childList: true, subtree: true });
  });
}

function positionSidecar(sidecar, popup) {
  const rect = popup.getBoundingClientRect();
  sidecar.style.position = 'fixed';
  sidecar.style.top = `${rect.top}px`;
  sidecar.style.left = `${rect.right + 8}px`;
  sidecar.style.zIndex = '9999';

  requestAnimationFrame(() => {
    const sidecarRect = sidecar.getBoundingClientRect();
    if (sidecarRect.right > window.innerWidth) {
      sidecar.style.left = `${rect.left - sidecarRect.width - 8}px`;
    }
  });
}

function removeSidecar() {
  if (currentSidecar) {
    currentSidecar.remove();
    currentSidecar = null;
  }
}

async function handleProjectClick(projectName, popup, calendarId) {
  if (!calendarId) {
    alert('Please set a time tracking calendar in the extension options.');
    return;
  }

  const times = extractTimeFromPopup(popup);
  if (!times) {
    alert('Could not detect the selected time range. Please try again.');
    return;
  }

  const buttons = currentSidecar.querySelectorAll('.gcal-tracker-btn');
  buttons.forEach(btn => { btn.disabled = true; });
  const clickedBtn = [...buttons].find(btn => btn.textContent === projectName);
  if (clickedBtn) clickedBtn.textContent = 'Creating...';

  chrome.runtime.sendMessage(
    {
      type: 'CREATE_EVENT',
      payload: {
        calendarId,
        summary: projectName,
        startTime: times.startTime,
        endTime: times.endTime,
      },
    },
    (response) => {
      if (response && response.error) {
        alert('Failed to create event: ' + response.error);
        if (clickedBtn) clickedBtn.textContent = projectName;
        buttons.forEach(btn => { btn.disabled = false; });
      } else {
        closeNativePopup(popup);
        removeSidecar();
      }
    }
  );
}

function closeNativePopup(popup) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

// Start observing when the page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', detectPopup);
} else {
  detectPopup();
}
