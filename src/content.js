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
  // The calendar dropdown has id="xCalSel". Options have data-value = btoa(calendarId).
  const calendarDropdown = popup.querySelector('#xCalSel');
  if (!calendarDropdown) return false;

  const encodedId = btoa(calendarId);

  // Check if the right calendar is already selected
  const currentSelection = calendarDropdown.querySelector('[role="option"][aria-selected="true"]');
  if (currentSelection && currentSelection.getAttribute('data-value') === encodedId) {
    return true; // already selected
  }

  // Open the dropdown by clicking the combobox
  const combobox = calendarDropdown.querySelector('[role="combobox"]');
  if (!combobox) return false;
  combobox.click();

  // Wait for dropdown to open
  await delay(150);

  // Find and click the right option
  const options = calendarDropdown.querySelectorAll('[role="option"]');
  for (const option of options) {
    if (option.getAttribute('data-value') === encodedId) {
      option.click();
      await delay(100);
      return true;
    }
  }

  // Calendar not found in dropdown — close it and fail
  combobox.click();
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
    // 1. Set the event title
    const titleInput = popup.querySelector('input[aria-label="Add title"]');
    if (!titleInput) {
      alert('Could not find the title input. GCal may have changed.');
      resetButtons(buttons, clickedBtn, projectName);
      return;
    }
    setNativeInputValue(titleInput, projectName);

    // 2. Select the time-tracking calendar
    const calendarSelected = await selectCalendar(popup, calendarId);
    if (!calendarSelected) {
      alert('Could not find the selected calendar in the dropdown. Check your extension options.');
      resetButtons(buttons, clickedBtn, projectName);
      return;
    }

    // 3. Click Save
    const saveBtn = popup.querySelector('button[jsname="x8hlje"]');
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
