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

function injectTracker(popup) {
  chrome.storage.sync.get({ projects: [], calendarId: '' }, ({ projects, calendarId }) => {
    if (projects.length === 0) return;

    // Find the scrollable content area to append our buttons at the bottom
    const scrollable = popup.querySelector('[data-bubble-scrollable-root]');
    const container = scrollable || popup;

    const tracker = document.createElement('div');
    tracker.id = 'gcal-tracker-buttons';

    const header = document.createElement('div');
    header.className = 'gcal-tracker-header';
    header.textContent = 'Quick Track';
    tracker.appendChild(header);

    if (!calendarId) {
      const warning = document.createElement('div');
      warning.className = 'gcal-tracker-warning';
      warning.textContent = 'Set a calendar in extension options first';
      tracker.appendChild(warning);
    }

    projects.forEach(project => {
      const btn = document.createElement('button');
      btn.className = 'gcal-tracker-btn';
      btn.textContent = project;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        fillProject(popup, project, calendarId, btn, tracker);
      });
      tracker.appendChild(btn);
    });

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
