const calendarNameInput = document.getElementById('calendar-name');
const saveCalendarBtn = document.getElementById('save-calendar-btn');
const groupListEl = document.getElementById('group-list');
const newProjectInput = document.getElementById('new-project');
const addProjectBtn = document.getElementById('add-project-btn');
const newGroupInput = document.getElementById('new-group');
const addGroupBtn = document.getElementById('add-group-btn');
const status = document.getElementById('status');

function showStatus(msg) {
  status.textContent = msg;
  setTimeout(() => { status.textContent = ''; }, 2000);
}

function migrateToGroups(data) {
  if (data.groups) return data.groups;
  const projects = data.projects || [];
  return [{ id: 'uncategorized', name: 'Other', projects }];
}

let groups = [];

function saveGroups(callback) {
  chrome.storage.sync.set({ groups }, callback);
}

function allProjectNames() {
  return groups.flatMap(g => g.projects);
}

function generateGroupId() {
  return 'g_' + Date.now();
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

// --- Group and project list with drag-and-drop reorder ---
let dragType = null;
let dragSourceGroupId = null;
let dragSourceProjectIndex = null;
let dragSourceGroupIndex = null;

function renderGroups(updatedGroups) {
  if (updatedGroups) groups = updatedGroups;
  groupListEl.innerHTML = '';

  groups.forEach((group, groupIndex) => {
    const isUncategorized = group.id === 'uncategorized';

    // Container wraps header + project rows for cross-group drop targeting
    const container = document.createElement('div');
    container.className = 'group-container' + (isUncategorized ? ' group-uncategorized' : '');
    container.dataset.groupIndex = groupIndex;

    // Cross-group project drop: highlight entire container, append to bottom
    container.addEventListener('dragover', (e) => {
      if (dragType === 'project' && dragSourceGroupId !== group.id) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        container.classList.add('drag-over');
      }
    });
    container.addEventListener('dragleave', (e) => {
      if (!container.contains(e.relatedTarget)) {
        container.classList.remove('drag-over');
      }
    });
    container.addEventListener('drop', (e) => {
      if (dragType === 'project' && dragSourceGroupId !== null && dragSourceGroupId !== group.id) {
        e.preventDefault();
        e.stopPropagation();
        container.classList.remove('drag-over');
        const srcGroup = groups.find(g => g.id === dragSourceGroupId);
        if (!srcGroup) return;
        const [movedProject] = srcGroup.projects.splice(dragSourceProjectIndex, 1);
        group.projects.push(movedProject);
        saveGroups(() => renderGroups());
      }
    });

    const header = document.createElement('div');
    header.className = 'group-header';

    if (!isUncategorized) {
      header.draggable = true;
      header.addEventListener('dragstart', (e) => {
        dragType = 'group';
        dragSourceGroupIndex = groupIndex;
        container.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', '');
      });
      header.addEventListener('dragend', () => {
        container.classList.remove('dragging');
        groupListEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        dragType = null;
        dragSourceGroupIndex = null;
      });
    }

    // Group reorder: header is the drop target for other group headers
    header.addEventListener('dragover', (e) => {
      if (dragType === 'group') {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        container.classList.add('drag-over');
      }
    });
    header.addEventListener('drop', (e) => {
      if (dragType === 'group' && dragSourceGroupIndex !== null) {
        e.preventDefault();
        e.stopPropagation();
        container.classList.remove('drag-over');
        if (isUncategorized || dragSourceGroupIndex === groupIndex) return;
        const [moved] = groups.splice(dragSourceGroupIndex, 1);
        let targetIdx = groupIndex;
        if (dragSourceGroupIndex < groupIndex) targetIdx--;
        groups.splice(targetIdx, 0, moved);
        saveGroups(() => renderGroups());
      }
    });

    if (!isUncategorized) {
      const grip = document.createElement('span');
      grip.className = 'drag-grip';
      grip.textContent = '⠿';
      header.appendChild(grip);
    }

    const nameEl = document.createElement('span');
    nameEl.className = 'group-name';
    nameEl.textContent = group.name;

    if (!isUncategorized) {
      nameEl.addEventListener('dblclick', () => {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'group-rename-input';
        input.value = group.name;
        nameEl.replaceWith(input);
        input.focus();
        input.select();

        let committed = false;
        const commit = () => {
          if (committed) return;
          committed = true;
          const newName = input.value.trim();
          if (!newName || newName === group.name) {
            input.replaceWith(nameEl);
            return;
          }
          const duplicate = groups.some(g => g.id !== group.id && g.name.toLowerCase() === newName.toLowerCase());
          if (duplicate) {
            showStatus('Group name already exists');
            input.replaceWith(nameEl);
            return;
          }
          group.name = newName;
          nameEl.textContent = newName;
          input.replaceWith(nameEl);
          saveGroups();
        };

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') input.replaceWith(nameEl);
        });
        input.addEventListener('blur', commit);
      });
    }
    header.appendChild(nameEl);

    const count = document.createElement('span');
    count.className = 'group-count';
    count.textContent = `${group.projects.length} project${group.projects.length !== 1 ? 's' : ''}`;
    header.appendChild(count);

    if (!isUncategorized) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'group-delete-btn';
      deleteBtn.textContent = '✕';
      deleteBtn.title = 'Delete group (projects move to Other)';
      deleteBtn.addEventListener('click', () => {
        const uncategorized = groups.find(g => g.id === 'uncategorized');
        uncategorized.projects.push(...group.projects);
        groups.splice(groupIndex, 1);
        saveGroups(() => renderGroups());
      });
      header.appendChild(deleteBtn);
    }

    container.appendChild(header);
    groupListEl.appendChild(container);

    group.projects.forEach((projectName, projectIndex) => {
      const row = document.createElement('div');
      row.className = 'project-row project-row-grouped';
      row.draggable = true;
      row.dataset.groupId = group.id;
      row.dataset.projectIndex = projectIndex;

      row.addEventListener('dragstart', (e) => {
        dragType = 'project';
        dragSourceGroupId = group.id;
        dragSourceProjectIndex = projectIndex;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', '');
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        groupListEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        dragType = null;
        dragSourceGroupId = null;
        dragSourceProjectIndex = null;
      });
      // Same-group reorder: row-level drop target
      row.addEventListener('dragover', (e) => {
        if (dragType === 'project' && dragSourceGroupId === group.id) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          row.classList.add('drag-over');
        }
      });
      row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over');
      });
      row.addEventListener('drop', (e) => {
        if (dragType === 'project' && dragSourceGroupId === group.id) {
          e.preventDefault();
          e.stopPropagation();
          row.classList.remove('drag-over');
          if (dragSourceProjectIndex === projectIndex) return;
          const [movedProject] = group.projects.splice(dragSourceProjectIndex, 1);
          let insertIndex = projectIndex;
          if (dragSourceProjectIndex < projectIndex) insertIndex--;
          group.projects.splice(insertIndex, 0, movedProject);
          saveGroups(() => renderGroups());
        }
      });

      const grip = document.createElement('span');
      grip.className = 'drag-grip';
      grip.textContent = '⠿';

      const span = document.createElement('span');
      span.className = 'project-name';
      span.textContent = projectName;

      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.className = 'remove-btn';
      removeBtn.addEventListener('click', () => {
        group.projects.splice(projectIndex, 1);
        saveGroups(() => renderGroups());
      });

      row.appendChild(grip);
      row.appendChild(span);
      row.appendChild(removeBtn);
      container.appendChild(row);
    });
  });
}

addProjectBtn.addEventListener('click', () => {
  const name = newProjectInput.value.trim();
  if (!name) return;
  if (allProjectNames().includes(name)) {
    showStatus('Project already exists');
    return;
  }
  const uncategorized = groups.find(g => g.id === 'uncategorized');
  uncategorized.projects.push(name);
  saveGroups(() => {
    renderGroups();
    newProjectInput.value = '';
    showStatus('Project added');
  });
});

newProjectInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addProjectBtn.click();
});

addGroupBtn.addEventListener('click', () => {
  const name = newGroupInput.value.trim();
  if (!name) return;
  const duplicate = groups.some(g => g.name.toLowerCase() === name.toLowerCase());
  if (duplicate) {
    showStatus('Group already exists');
    return;
  }
  const newGroup = { id: generateGroupId(), name, projects: [] };
  groups.splice(groups.length - 1, 0, newGroup);
  saveGroups(() => {
    renderGroups();
    newGroupInput.value = '';
    showStatus('Group added');
  });
});

newGroupInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addGroupBtn.click();
});

// Load saved projects on page open
chrome.storage.sync.get({ groups: null, projects: null }, (data) => {
  const groups = migrateToGroups(data);
  if (!data.groups) {
    chrome.storage.sync.set({ groups }, () => {
      chrome.storage.sync.remove('projects');
    });
  }
  renderGroups(groups);
});
