# GCal Time Tracker Helper - Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome extension that adds a quick-create sidecar to Google Calendar's click+drag popup, enabling one-click event creation on a designated time-tracking calendar.

**Architecture:** Manifest V3 Chrome extension. Background service worker handles OAuth2 and Google Calendar API calls. Content script detects the native quick-create popup and injects a sidecar panel listing saved projects. Options page lets user pick their time-tracking calendar and manage project names.

**Tech Stack:** Vanilla JS, Chrome Extension APIs (Manifest V3), Google Calendar API v3, OAuth2 via `chrome.identity`

---

## File Structure

```
src/
  manifest.json          - Extension manifest (permissions, scripts, OAuth config)
  background.js          - Service worker: OAuth2 token mgmt, Calendar API proxy
  content.js             - Content script: popup detection, sidecar injection
  content.css            - Sidecar panel styling
  options.html           - Options page markup
  options.js             - Options page logic (calendar dropdown, project list CRUD)
  options.css            - Options page styling
  icons/
    icon16.png           - Extension icon 16x16
    icon48.png           - Extension icon 48x48
    icon128.png          - Extension icon 128x128
```

---

### Task 1: Project Scaffolding & Manifest

**Files:**
- Create: `src/manifest.json`
- Create: `src/background.js` (empty service worker stub)
- Create: `src/content.js` (empty stub)
- Create: `src/content.css` (empty stub)
- Create: `src/options.html` (minimal page)
- Create: `src/options.js` (empty stub)
- Create: `src/options.css` (empty stub)
- Create: `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
.env
*.pem
```

- [ ] **Step 2: Create `src/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "GCal Time Tracker Helper",
  "version": "1.0.0",
  "description": "Quick-create time tracking events on Google Calendar",
  "permissions": [
    "identity",
    "storage"
  ],
  "host_permissions": [
    "https://calendar.google.com/*",
    "https://www.googleapis.com/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://calendar.google.com/*"],
      "js": ["content.js"],
      "css": ["content.css"]
    }
  ],
  "options_ui": {
    "page": "options.html",
    "open_in_tab": true
  },
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/calendar"
    ]
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 3: Create stub files**

`src/background.js`:
```js
// Service worker for OAuth2 and Calendar API
console.log('GCal Time Tracker Helper: service worker loaded');
```

`src/content.js`:
```js
// Content script for GCal popup detection and sidecar injection
console.log('GCal Time Tracker Helper: content script loaded');
```

`src/content.css`:
```css
/* Sidecar panel styles */
```

`src/options.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>GCal Time Tracker Helper - Options</title>
  <link rel="stylesheet" href="options.css">
</head>
<body>
  <h1>GCal Time Tracker Helper</h1>
  <div id="app"></div>
  <script src="options.js"></script>
</body>
</html>
```

`src/options.js`:
```js
// Options page logic
console.log('GCal Time Tracker Helper: options page loaded');
```

`src/options.css`:
```css
/* Options page styles */
```

- [ ] **Step 4: Create placeholder icons**

Generate simple colored square PNGs at 16x16, 48x48, and 128x128 using a canvas script or any method. These are placeholders.

- [ ] **Step 5: Verify — load unpacked extension in Chrome**

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" → select the `src/` folder
4. Verify extension loads without errors
5. Open Google Calendar — check console for "content script loaded" message

- [ ] **Step 6: Commit**

```bash
git add .gitignore src/
git commit -m "feat: scaffold Chrome extension with Manifest V3"
```

---

### Task 2: Background Service Worker — OAuth2 & Calendar API

**Files:**
- Modify: `src/background.js`

- [ ] **Step 1: Implement OAuth2 token retrieval**

```js
function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(token);
      }
    });
  });
}

async function fetchWithAuth(url, options = {}) {
  let token = await getAuthToken();
  let response = await fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });
  // If 401, clear cached token and retry once
  if (response.status === 401) {
    await new Promise((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve));
    token = await getAuthToken();
    response = await fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });
  }
  return response;
}
```

- [ ] **Step 2: Implement `listCalendars` API call**

```js
async function listCalendars() {
  const response = await fetchWithAuth(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList'
  );
  if (!response.ok) throw new Error(`Calendar API error: ${response.status}`);
  const data = await response.json();
  return data.items.filter(cal => cal.accessRole === 'owner' || cal.accessRole === 'writer');
}
```

- [ ] **Step 3: Implement `createEvent` API call**

```js
async function createEvent({ calendarId, summary, startTime, endTime }) {
  const response = await fetchWithAuth(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary,
        start: { dateTime: startTime },
        end: { dateTime: endTime },
      }),
    }
  );
  if (!response.ok) throw new Error(`Create event error: ${response.status}`);
  return response.json();
}
```

- [ ] **Step 4: Wire up message listener for content script communication**

```js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'LIST_CALENDARS') {
    listCalendars().then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true; // async response
  }
  if (message.type === 'CREATE_EVENT') {
    createEvent(message.payload)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});
```

- [ ] **Step 5: Verify — test OAuth flow**

1. Reload extension in `chrome://extensions`
2. Open extension's service worker console (click "service worker" link)
3. In console, run: `chrome.runtime.sendMessage({ type: 'LIST_CALENDARS' }, console.log)`
4. Should trigger OAuth popup, then log calendar list

Note: This requires a valid OAuth `client_id` in manifest.json. The user must:
1. Create a Google Cloud project
2. Enable Google Calendar API
3. Create OAuth2 credentials (Chrome Extension type)
4. Set the extension ID in the allowed origins
5. Replace `YOUR_CLIENT_ID` in manifest.json

- [ ] **Step 6: Commit**

```bash
git add src/background.js
git commit -m "feat: add OAuth2 and Calendar API in background service worker"
```

---

### Task 3: Options Page — Calendar Picker & Project List

**Files:**
- Modify: `src/options.html`
- Modify: `src/options.js`
- Modify: `src/options.css`

- [ ] **Step 1: Build options page HTML**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>GCal Time Tracker Helper - Options</title>
  <link rel="stylesheet" href="options.css">
</head>
<body>
  <div class="container">
    <h1>GCal Time Tracker Helper</h1>

    <section>
      <h2>Time Tracking Calendar</h2>
      <p>Events will be created on this calendar.</p>
      <button id="auth-btn">Connect Google Account</button>
      <select id="calendar-select" disabled>
        <option value="">Connect account first...</option>
      </select>
    </section>

    <section>
      <h2>Projects</h2>
      <p>These will appear as quick-create buttons on Google Calendar.</p>
      <div id="project-list"></div>
      <div class="add-project">
        <input type="text" id="new-project" placeholder="e.g. [Research]">
        <button id="add-project-btn">Add</button>
      </div>
    </section>

    <div id="status"></div>
  </div>
  <script src="options.js"></script>
</body>
</html>
```

- [ ] **Step 2: Implement options page JS**

```js
const calendarSelect = document.getElementById('calendar-select');
const authBtn = document.getElementById('auth-btn');
const projectList = document.getElementById('project-list');
const newProjectInput = document.getElementById('new-project');
const addProjectBtn = document.getElementById('add-project-btn');
const status = document.getElementById('status');

function showStatus(msg) {
  status.textContent = msg;
  setTimeout(() => { status.textContent = ''; }, 2000);
}

// --- Auth & Calendar loading ---
authBtn.addEventListener('click', async () => {
  chrome.runtime.sendMessage({ type: 'LIST_CALENDARS' }, (calendars) => {
    if (calendars.error) {
      showStatus('Error: ' + calendars.error);
      return;
    }
    calendarSelect.disabled = false;
    calendarSelect.innerHTML = '<option value="">Select a calendar...</option>';
    calendars.forEach(cal => {
      const opt = document.createElement('option');
      opt.value = cal.id;
      opt.textContent = cal.summary;
      calendarSelect.appendChild(opt);
    });
    // Restore saved selection
    chrome.storage.sync.get('calendarId', ({ calendarId }) => {
      if (calendarId) calendarSelect.value = calendarId;
    });
    authBtn.textContent = 'Refresh Calendars';
    showStatus('Calendars loaded');
  });
});

calendarSelect.addEventListener('change', () => {
  const calendarId = calendarSelect.value;
  if (calendarId) {
    chrome.storage.sync.set({ calendarId }, () => showStatus('Calendar saved'));
  }
});

// --- Project list ---
function renderProjects(projects) {
  projectList.innerHTML = '';
  projects.forEach((name, i) => {
    const row = document.createElement('div');
    row.className = 'project-row';
    const span = document.createElement('span');
    span.textContent = name;
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.className = 'remove-btn';
    removeBtn.addEventListener('click', () => {
      projects.splice(i, 1);
      chrome.storage.sync.set({ projects }, () => renderProjects(projects));
    });
    row.appendChild(span);
    row.appendChild(removeBtn);
    projectList.appendChild(row);
  });
}

addProjectBtn.addEventListener('click', () => {
  const name = newProjectInput.value.trim();
  if (!name) return;
  chrome.storage.sync.get({ projects: [] }, ({ projects }) => {
    if (projects.includes(name)) {
      showStatus('Project already exists');
      return;
    }
    projects.push(name);
    chrome.storage.sync.set({ projects }, () => {
      renderProjects(projects);
      newProjectInput.value = '';
      showStatus('Project added');
    });
  });
});

newProjectInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addProjectBtn.click();
});

// Load saved projects on page open
chrome.storage.sync.get({ projects: [] }, ({ projects }) => renderProjects(projects));
```

- [ ] **Step 3: Style the options page**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f5f5;
  color: #333;
  padding: 2rem;
}

.container {
  max-width: 500px;
  margin: 0 auto;
  background: #fff;
  border-radius: 8px;
  padding: 2rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

h1 { font-size: 1.4rem; margin-bottom: 1.5rem; }
h2 { font-size: 1.1rem; margin-bottom: 0.5rem; }
p { font-size: 0.85rem; color: #666; margin-bottom: 0.75rem; }

section { margin-bottom: 2rem; }

select, input[type="text"] {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
  margin-top: 0.25rem;
}

button {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  background: #1a73e8;
  color: #fff;
}
button:hover { background: #1557b0; }

#auth-btn { margin-bottom: 0.75rem; }

.add-project {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.add-project input { flex: 1; }

.project-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid #eee;
}

.remove-btn {
  background: #dc3545;
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
}
.remove-btn:hover { background: #b02a37; }

#status {
  margin-top: 1rem;
  font-size: 0.85rem;
  color: #1a73e8;
}
```

- [ ] **Step 4: Verify — test options page**

1. Reload extension
2. Right-click extension icon → "Options" (or go to `chrome://extensions` → Details → Extension options)
3. Click "Connect Google Account" → should trigger OAuth and populate dropdown
4. Select a calendar → should save
5. Add/remove projects → should persist (close and reopen to verify)

- [ ] **Step 5: Commit**

```bash
git add src/options.html src/options.js src/options.css
git commit -m "feat: add options page with calendar picker and project list"
```

---

### Task 4: Content Script — Popup Detection & Sidecar Injection

**Files:**
- Modify: `src/content.js`
- Modify: `src/content.css`

This is the core feature. The content script needs to:
1. Detect when GCal's quick-create popup appears (after click+drag)
2. Parse the start/end time from the popup
3. Inject a sidecar panel next to the popup with project buttons
4. On button click: create the event via background worker and close the popup

- [ ] **Step 1: Implement popup detection with MutationObserver**

GCal's quick-create popup is a `div` with `data-eventid=""` (empty, since it's a new event) inside a container. The reliable way to detect it is to watch for new elements matching GCal's popup structure. The popup appears as a bubble/dialog with an input field for the event title.

```js
// content.js

let currentSidecar = null;

function detectPopup() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        // GCal quick-create popup: look for the bubble container
        // The popup has a contenteditable span for the title and
        // uses role="dialog" or similar. We look for the "More options" button
        // as a reliable anchor.
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
  // GCal's quick-create popup contains a "Save" button and "More options" link.
  // The popup is a container div that gets added to the DOM on click+drag.
  // We detect it by looking for the element with data-eventid attribute
  // or by finding the new-event editing bubble.

  // Strategy: look for the popup container that has the title input
  // GCal uses a span[data-placeholder] or contenteditable for the title
  if (node.matches && node.matches('[data-eventid]')) return node;
  const found = node.querySelector && node.querySelector('[data-eventid]');
  if (found) return found;

  // Fallback: look for the bubble that contains "Save" and "More options"
  const buttons = node.querySelectorAll && node.querySelectorAll('button');
  if (buttons) {
    for (const btn of buttons) {
      if (btn.textContent.trim() === 'Save') {
        // Walk up to find the popup container
        let container = btn.closest('[role="dialog"], [data-eventid]');
        if (container) return container;
        // If no role=dialog, use the parent bubble
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
```

- [ ] **Step 2: Implement time extraction from the popup**

```js
function extractTimeFromPopup(popup) {
  // GCal's quick-create popup shows the selected time range.
  // The time info is in the popup or can be derived from the calendar grid.
  // Look for time text like "10:00am – 11:00am" in the popup.

  // Strategy 1: Find the time display element in the popup
  const allText = popup.innerText;
  // Match patterns like "Friday, March 19\n10:00 – 11:00am" or "10:00am – 11:00am"
  const timePattern = /(\d{1,2}(?::\d{2})?(?:am|pm)?)\s*[–\-]\s*(\d{1,2}(?::\d{2})?(?:am|pm)?)/i;
  const match = allText.match(timePattern);

  if (match) {
    return parseTimeRange(match[0]);
  }

  // Strategy 2: Read from the selected grid cells
  // GCal highlights selected cells with specific classes
  const selectedCells = document.querySelectorAll('[data-eventchip][aria-selected="true"]');
  if (selectedCells.length > 0) {
    // Extract from aria-label or data attributes
  }

  return null;
}

function parseTimeRange(timeText) {
  // Parse "10:00am – 11:00am" or "Friday, March 19, 10:00am – 11:00am"
  // into ISO datetime strings for today or the indicated date
  const timePattern = /(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s*[–\-]\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)?/i;
  const match = timeText.match(timePattern);
  if (!match) return null;

  let [, startRaw, startMeridiem, endRaw, endMeridiem] = match;

  // If only end has am/pm, infer start meridiem.
  // GCal omits start meridiem when it's the same as end, e.g. "10:00 – 11:00am"
  // But for cross-meridiem ranges like "11:00 – 1:00pm", start should be am.
  if (!startMeridiem && endMeridiem) {
    // Apply end meridiem to start, then check if that produces start > end.
    // If so, the start is in the opposite meridiem.
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

  // Determine the date — check the popup for date info, default to today
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
  // Look for date text in the popup — GCal shows it like "Friday, March 19"
  // or we can read from the column header of the selected time slot
  const headers = document.querySelectorAll('[data-datekey]');
  // The selected column header contains the date
  // For now, we'll try to find the date from nearby elements
  // This may need refinement based on actual DOM structure

  // Fallback: check selected grid elements
  const selected = document.querySelector('.yDmH0d[data-datekey]');
  if (selected) {
    const dateKey = selected.getAttribute('data-datekey');
    // dateKey format: "YYYYMMDD" typically
    if (dateKey && dateKey.length === 8) {
      const y = dateKey.substring(0, 4);
      const m = dateKey.substring(4, 6);
      const d = dateKey.substring(6, 8);
      return `${y}-${m}-${d}`;
    }
  }
  return null; // will use today
}
```

- [ ] **Step 3: Implement sidecar injection**

```js
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

    // Position the sidecar next to the popup
    positionSidecar(sidecar, popup);
    document.body.appendChild(sidecar);
    currentSidecar = sidecar;

    // Watch for popup removal to clean up sidecar
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

  // If sidecar would go off-screen to the right, place it on the left
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
```

- [ ] **Step 4: Implement project click handler**

```js
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

  // Show loading state
  const buttons = currentSidecar.querySelectorAll('.gcal-tracker-btn');
  buttons.forEach(btn => { btn.disabled = true; });
  const clickedBtn = [...buttons].find(btn => btn.textContent === projectName);
  if (clickedBtn) clickedBtn.textContent = 'Creating...';

  // Send create event message to background worker
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
        // Success — close the native popup and sidecar
        closeNativePopup(popup);
        removeSidecar();
        // Force GCal to refresh so the event appears
        // A small delay then refetch is simplest
      }
    }
  );
}

function closeNativePopup(popup) {
  // Try pressing Escape to close the native popup
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}
```

- [ ] **Step 5: Initialize the content script**

```js
// Start observing when the page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', detectPopup);
} else {
  detectPopup();
}
```

- [ ] **Step 6: Style the sidecar panel**

```css
#gcal-tracker-sidecar {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  padding: 12px;
  min-width: 160px;
  max-width: 220px;
  font-family: 'Google Sans', Roboto, Arial, sans-serif;
}

.gcal-tracker-header {
  font-size: 13px;
  font-weight: 500;
  color: #5f6368;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e0e0e0;
}

.gcal-tracker-warning {
  font-size: 12px;
  color: #d93025;
  margin-bottom: 8px;
}

.gcal-tracker-btn {
  display: block;
  width: 100%;
  padding: 8px 12px;
  margin-bottom: 4px;
  border: none;
  border-radius: 4px;
  background: #e8f0fe;
  color: #1a73e8;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s;
}

.gcal-tracker-btn:hover {
  background: #d2e3fc;
}

.gcal-tracker-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.gcal-tracker-btn:last-child {
  margin-bottom: 0;
}
```

- [ ] **Step 7: Verify — test full flow**

1. Reload extension in `chrome://extensions`
2. Open Google Calendar (week or day view)
3. Click+drag on the calendar to select a time range
4. The native quick-create popup should appear
5. A sidecar panel should appear next to it with your project buttons
6. Click a project button → should create the event and close both popups
7. Verify the event appears on the designated calendar

**Debugging notes:**
- If the sidecar doesn't appear, check the console for errors and inspect the DOM to understand the popup structure. The `findQuickCreatePopup` selectors may need adjustment based on GCal's current DOM.
- If time extraction fails, inspect the popup's `innerText` to see the actual format and adjust `parseTimeRange` accordingly.

- [ ] **Step 8: Commit**

```bash
git add src/content.js src/content.css
git commit -m "feat: add sidecar panel with one-click event creation"
```

---

### Task 5: Polish & Edge Cases

**Files:**
- Modify: `src/content.js`
- Modify: `src/content.css`

- [ ] **Step 1: Handle popup re-creation**

When the user closes a popup and creates a new one (clicks+drags again), ensure the old sidecar is cleaned up:

In `detectPopup`, before `injectSidecar(popup)`:
```js
removeSidecar(); // clean up any existing sidecar
```

Remove the `!currentSidecar` guard from the detection condition.

- [ ] **Step 2: Handle calendar page navigation (SPA)**

GCal is a SPA — when the user navigates between day/week/month views, the content script stays alive but the DOM changes. The MutationObserver should handle this since it watches `document.body`. Verify this works; no code change expected.

- [ ] **Step 3: Add visual feedback on successful event creation**

After successful creation, briefly show a success indicator before the sidecar disappears:

```js
// In the success branch of handleProjectClick callback:
if (clickedBtn) {
  clickedBtn.textContent = 'Created!';
  clickedBtn.style.background = '#ceead6';
  clickedBtn.style.color = '#137333';
}
setTimeout(() => {
  closeNativePopup(popup);
  removeSidecar();
}, 600);
```

- [ ] **Step 4: Verify all edge cases**

1. Click+drag, click project → event created, popup closed
2. Click+drag, close popup with Escape → sidecar removed
3. Click+drag again → new sidecar appears correctly
4. Switch calendar views (day/week) → sidecar still works
5. No projects configured → no sidecar appears (not an error)
6. No calendar configured → sidecar shows warning message

- [ ] **Step 5: Commit**

```bash
git add src/content.js src/content.css
git commit -m "fix: handle popup lifecycle and add creation feedback"
```

---

### Task 6: DOM Refinement (Expect Iteration)

**Files:**
- Modify: `src/content.js`

**Important context:** GCal's DOM is heavily obfuscated (class names like `pPTZT`, `jKgTtb`, etc.) and changes with Google's releases. The selectors in Task 4 are best-guess patterns. This task is for iterating on the actual DOM structure after loading the extension on the live site.

- [ ] **Step 1: Inspect the actual quick-create popup DOM**

1. Open GCal, open DevTools
2. Click+drag to trigger the popup
3. Inspect the popup element — note:
   - What element is the root container?
   - What attributes does it have? (`role`, `data-*`, `class`)
   - Where is the time text rendered?
   - What does the "Save" button look like?

- [ ] **Step 2: Update `findQuickCreatePopup` with real selectors**

Update the selectors based on actual DOM inspection findings.

- [ ] **Step 3: Update `extractTimeFromPopup` with real time element location**

Update time parsing based on where GCal actually renders the time string.

- [ ] **Step 4: Update `extractDateFromPopup` with real date element location**

Update date extraction based on actual DOM structure.

- [ ] **Step 5: Update `closeNativePopup` if Escape doesn't work**

If `Escape` keydown doesn't close the popup, try:
- Clicking a close/X button in the popup
- Clicking outside the popup
- Finding and clicking a specific dismiss element

- [ ] **Step 6: Verify the full flow works end-to-end**

Run through the full test from Task 4 Step 7 again.

- [ ] **Step 7: Commit**

```bash
git add src/content.js
git commit -m "fix: refine DOM selectors for GCal quick-create popup"
```
