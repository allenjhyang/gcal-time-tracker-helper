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
