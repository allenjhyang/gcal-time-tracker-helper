// Content script for GCal popup detection and sidecar injection

let currentSidecar = null;

function detectPopup() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const popup = findQuickCreatePopup(node);
        if (popup) {
          removeSidecar(); // clean up any existing sidecar
          injectSidecar(popup);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function findQuickCreatePopup(node) {
  // The quick-create popup is the editing bubble that appears on click+drag.
  // It has role="dialog" and data-chips-dialog="true", plus a "Save" button.
  // We must NOT match on [data-eventid] alone since every event chip has that.

  // Check if node itself is the dialog
  if (node.matches && node.matches('[role="dialog"][data-chips-dialog="true"]')) return node;
  const dialogChild = node.querySelector && node.querySelector('[role="dialog"][data-chips-dialog="true"]');
  if (dialogChild) return dialogChild;

  // Fallback: look for Save button as anchor
  const buttons = node.querySelectorAll ? node.querySelectorAll('button') : [];
  let hasSave = false;
  for (const btn of buttons) {
    if (btn.textContent.trim() === 'Save') {
      hasSave = true;
      break;
    }
  }
  if (!hasSave) return null;

  const dialog = node.closest ? node.closest('[role="dialog"]') : null;
  if (dialog) return dialog;
  if (node.matches && node.matches('[role="dialog"]')) return node;

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
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        handleProjectClick(project, popup, calendarId);
      });
      btn.addEventListener('mousedown', (e) => e.stopPropagation());
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

// --- DOM manipulation helpers ---

function setNativeInputValue(input, value) {
  // Use the native setter so GCal's framework picks up the change
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function selectCalendar(popup, calendarId) {
  const encodedId = btoa(calendarId).replace(/=+$/, '');

  // Go straight to the calendar combobox — it's in the DOM even when
  // the section looks collapsed. Don't click data-key="calendar" as
  // that navigates away / closes the popup.
  const combobox = document.querySelector('[role="combobox"][aria-label="Calendar"]');
  if (!combobox) return false;

  // Check if already selected by reading the current display text
  // and comparing against the options list
  combobox.click();
  await delay(300);

  // Find and click the right option — search broadly since dropdown may be hoisted
  const allOptions = document.querySelectorAll('[role="option"]');
  for (const option of allOptions) {
    if (option.getAttribute('data-value') === encodedId) {
      option.click();
      await delay(200);
      return true;
    }
  }

  // Not found — close dropdown
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return false;
}

async function handleProjectClick(projectName, popup, calendarId) {
  if (!calendarId) {
    alert('Please set a time tracking calendar in the extension options.');
    return;
  }

  // Show loading state
  const buttons = currentSidecar.querySelectorAll('.gcal-tracker-btn');
  buttons.forEach(btn => { btn.disabled = true; });
  const clickedBtn = [...buttons].find(btn => btn.textContent === projectName);
  if (clickedBtn) clickedBtn.textContent = 'Creating...';

  try {
    // 1. Select the time-tracking calendar FIRST (this may re-render the popup)
    const calendarSelected = await selectCalendar(popup, calendarId);
    if (!calendarSelected) {
      alert('Could not find the selected calendar in the dropdown. Check your extension options.');
      resetButtons(buttons, clickedBtn, projectName);
      return;
    }

    // 2. Re-find the dialog (GCal re-renders during calendar selection)
    await delay(200);
    const currentDialog = document.querySelector('[role="dialog"][data-chips-dialog="true"]');
    if (!currentDialog) {
      alert('Dialog disappeared. Please try again.');
      resetButtons(buttons, clickedBtn, projectName);
      return;
    }

    // 3. Set the event title on the fresh DOM
    const titleInput = currentDialog.querySelector('input[aria-label="Add title"]');
    if (!titleInput) {
      alert('Could not find the title input. GCal may have changed.');
      resetButtons(buttons, clickedBtn, projectName);
      return;
    }
    setNativeInputValue(titleInput, projectName);

    // 4. Click Save
    const saveBtn = currentDialog.querySelector('button[jsname="x8hlje"]');
    if (!saveBtn) {
      alert('Could not find the Save button. GCal may have changed.');
      resetButtons(buttons, clickedBtn, projectName);
      return;
    }

    // Show success feedback briefly, then save
    if (clickedBtn) {
      clickedBtn.textContent = 'Created!';
      clickedBtn.style.background = '#ceead6';
      clickedBtn.style.color = '#137333';
    }

    await delay(300);
    removeSidecar();
    saveBtn.click();

  } catch (err) {
    alert('Error creating event: ' + err.message);
    resetButtons(buttons, clickedBtn, projectName);
  }
}

function resetButtons(buttons, clickedBtn, projectName) {
  if (clickedBtn) clickedBtn.textContent = projectName;
  buttons.forEach(btn => { btn.disabled = false; });
}

// Start observing when the page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', detectPopup);
} else {
  detectPopup();
}
