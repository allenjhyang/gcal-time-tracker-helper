// Content script for GCal popup detection and project quick-fill

let currentTracker = null;

function detectPopup() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const popup = findQuickCreatePopup(node);
        if (popup) {
          removeTracker();
          injectTracker(popup);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function findQuickCreatePopup(node) {
  if (node.matches && node.matches('[role="dialog"][data-chips-dialog="true"]')) return node;
  const dialogChild = node.querySelector && node.querySelector('[role="dialog"][data-chips-dialog="true"]');
  if (dialogChild) return dialogChild;
  return null;
}

function getCalendarColor(popup) {
  // Try to read the calendar color from the color swatch in the popup
  const swatch = popup.querySelector('.tWokJb');
  if (swatch) return swatch.style.backgroundColor;
  // Fallback: read from the color picker's selected color
  const colorBtn = popup.querySelector('[jsname="QPiGnd"]');
  if (colorBtn) return colorBtn.style.backgroundColor;
  return null;
}

function getContrastColor(bgColor) {
  // Parse rgb(r, g, b) and compute luminance to pick black or white text
  const match = bgColor.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) return '#000';
  const [, r, g, b] = match.map(Number);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000' : '#fff';
}

function injectTracker(popup) {
  chrome.storage.sync.get({ projects: [], calendarId: '' }, ({ projects, calendarId }) => {
    if (projects.length === 0) return;

    // Find the scrollable content area to append our buttons at the bottom
    const scrollable = popup.querySelector('[data-bubble-scrollable-root]');
    const container = scrollable || popup;

    // Get the calendar color for pill styling
    const calColor = getCalendarColor(popup);
    const textColor = calColor ? getContrastColor(calColor) : null;

    const tracker = document.createElement('div');
    tracker.id = 'gcal-tracker-buttons';

    const row = document.createElement('div');
    row.className = 'gcal-tracker-row';

    const icon = document.createElement('i');
    icon.className = 'google-material-icons notranslate gcal-tracker-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'timer';
    row.appendChild(icon);

    const content = document.createElement('div');
    content.className = 'gcal-tracker-content';

    const header = document.createElement('div');
    header.className = 'gcal-tracker-header';
    header.textContent = 'Time tracking';
    content.appendChild(header);

    if (!calendarId) {
      const warning = document.createElement('div');
      warning.className = 'gcal-tracker-warning';
      warning.textContent = 'Set a calendar in extension options first';
      content.appendChild(warning);
    }

    const pills = document.createElement('div');
    pills.className = 'gcal-tracker-pills';

    projects.forEach(project => {
      const btn = document.createElement('button');
      btn.className = 'gcal-tracker-btn';
      btn.textContent = project;
      if (calColor) {
        btn.style.backgroundColor = calColor;
        btn.style.color = textColor;
        btn.style.borderColor = calColor;
      }
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        fillProject(popup, project, calendarId, btn, tracker);
      });
      pills.appendChild(btn);
    });

    content.appendChild(pills);
    row.appendChild(content);
    tracker.appendChild(row);

    container.appendChild(tracker);
    currentTracker = tracker;

    // Clean up when popup is removed
    const cleanupObserver = new MutationObserver(() => {
      if (!document.body.contains(popup)) {
        removeTracker();
        cleanupObserver.disconnect();
      }
    });
    cleanupObserver.observe(document.body, { childList: true, subtree: true });
  });
}

function removeTracker() {
  if (currentTracker) {
    currentTracker.remove();
    currentTracker = null;
  }
}

function setNativeInputValue(input, value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fillProject(popup, projectName, calendarId, clickedBtn, tracker) {
  // Mark which button was selected
  tracker.querySelectorAll('.gcal-tracker-btn').forEach(btn => {
    btn.classList.remove('gcal-tracker-btn-active');
  });
  clickedBtn.classList.add('gcal-tracker-btn-active');

  // 1. Fill in the title
  const titleInput = popup.querySelector('input[aria-label="Add title"]');
  if (titleInput) {
    titleInput.focus();
    setNativeInputValue(titleInput, projectName);
  }

  // 2. Select the calendar if configured
  if (calendarId) {
    const encodedId = btoa(calendarId).replace(/=+$/, '');
    const combobox = popup.querySelector('[role="combobox"][aria-label="Calendar"]');
    if (combobox) {
      combobox.click();
      await delay(300);

      const allOptions = document.querySelectorAll('[role="option"]');
      for (const option of allOptions) {
        if (option.getAttribute('data-value') === encodedId) {
          option.click();
          break;
        }
      }
    }
  }
}

// Start observing when the page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', detectPopup);
} else {
  detectPopup();
}
