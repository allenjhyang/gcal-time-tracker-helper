const calendarNameInput = document.getElementById('calendar-name');
const saveCalendarBtn = document.getElementById('save-calendar-btn');
const projectList = document.getElementById('project-list');
const newProjectInput = document.getElementById('new-project');
const addProjectBtn = document.getElementById('add-project-btn');
const status = document.getElementById('status');

function showStatus(msg) {
  status.textContent = msg;
  setTimeout(() => { status.textContent = ''; }, 2000);
}

// --- Calendar name ---
saveCalendarBtn.addEventListener('click', () => {
  const calendarName = calendarNameInput.value.trim();
  chrome.storage.sync.set({ calendarName }, () => showStatus(calendarName ? 'Calendar name saved' : 'Calendar name cleared'));
});

calendarNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveCalendarBtn.click();
});

// Load saved calendar name on page open
chrome.storage.sync.get({ calendarName: '' }, ({ calendarName }) => {
  calendarNameInput.value = calendarName;
});

// --- Project list with drag-and-drop reorder ---
let dragSrcIndex = null;

function renderProjects(projects) {
  projectList.innerHTML = '';
  projects.forEach((name, i) => {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.draggable = true;
    row.dataset.index = i;

    const grip = document.createElement('span');
    grip.className = 'drag-grip';
    grip.textContent = '⠿';

    const span = document.createElement('span');
    span.className = 'project-name';
    span.textContent = name;

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.className = 'remove-btn';
    removeBtn.addEventListener('click', () => {
      projects.splice(i, 1);
      chrome.storage.sync.set({ projects }, () => renderProjects(projects));
    });

    row.addEventListener('dragstart', (e) => {
      dragSrcIndex = i;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      projectList.querySelectorAll('.project-row').forEach(r => r.classList.remove('drag-over'));
      dragSrcIndex = null;
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over');
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const targetIndex = parseInt(row.dataset.index);
      if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;
      const [moved] = projects.splice(dragSrcIndex, 1);
      projects.splice(targetIndex, 0, moved);
      chrome.storage.sync.set({ projects }, () => renderProjects(projects));
    });

    row.appendChild(grip);
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
