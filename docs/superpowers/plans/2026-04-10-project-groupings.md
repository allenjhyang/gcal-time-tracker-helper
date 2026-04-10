# Project Groupings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to organize time-tracking projects into named groups, reflected across the options screen, quick-create popup, and left nav summary.

**Architecture:** Migrate the flat `projects: string[]` storage to a `groups` array where each group has an id, name, and ordered projects array. Both `options.js` and `content.js` check for and perform idempotent migration on load. The "Other" group (id: `"uncategorized"`) is always last and cannot be reordered/renamed/deleted.

**Tech Stack:** Chrome Extension (Manifest V3), vanilla JS, Chrome Storage Sync API, HTML/CSS

**Spec:** `docs/superpowers/specs/2026-04-10-project-groupings-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/options.html` | Add "Add Group" input/button above project list |
| `src/options.js` | Migration logic, group CRUD, inline rename, grouped drag-and-drop, grouped rendering |
| `src/options.css` | Group header styles, indented project rows, rename input styles |
| `src/content.js` | Migration logic, read `groups` instead of `projects`, grouped pills in popup, grouped stats in left nav |
| `src/content.css` | Group label styles for quick-create rows and left nav section headers |

---

### Task 1: Data Migration Helper (options.js)

**Files:**
- Modify: `src/options.js:1-6` (top of file, add migration helper)

This task adds the migration function and updates the initial load to use `groups` instead of `projects`.

- [ ] **Step 1: Add migration helper function at the top of options.js**

Insert after line 6 (after the `status` element reference), before the `showStatus` function:

```js
function migrateToGroups(data) {
  if (data.groups) return data.groups;
  const projects = data.projects || [];
  return [{ id: 'uncategorized', name: 'Other', projects }];
}
```

- [ ] **Step 2: Update the initial project load to use groups**

Replace line 112:
```js
// Load saved projects on page open
chrome.storage.sync.get({ projects: [] }, ({ projects }) => renderProjects(projects));
```

With:
```js
// Load saved data on page open — migrate if needed
chrome.storage.sync.get({ groups: null, projects: null }, (data) => {
  const groups = migrateToGroups(data);
  if (!data.groups) {
    chrome.storage.sync.set({ groups }, () => {
      chrome.storage.sync.remove('projects');
    });
  }
  renderGroups(groups);
});
```

Note: `renderGroups` does not exist yet — it will be created in Task 3. For now, this will error. We'll wire it up in Task 3.

- [ ] **Step 3: Commit**

```bash
git add src/options.js
git commit -m "feat: add data migration helper for project groupings"
```

---

### Task 2: Options HTML — Add Group Input

**Files:**
- Modify: `src/options.html:22-30`

- [ ] **Step 1: Add "Add Group" input section in options.html**

Replace lines 22-30:
```html
    <section>
      <h2>Projects</h2>
      <p>These will appear as quick-create buttons on Google Calendar.</p>
      <div id="project-list"></div>
      <div class="add-project">
        <input type="text" id="new-project" placeholder="e.g. [Research]">
        <button id="add-project-btn">Add</button>
      </div>
    </section>
```

With:
```html
    <section>
      <h2>Projects</h2>
      <p>These will appear as quick-create buttons on Google Calendar.</p>
      <div class="add-group">
        <input type="text" id="new-group" placeholder="e.g. Engineering">
        <button id="add-group-btn">Add Group</button>
      </div>
      <div id="group-list"></div>
      <div class="add-project">
        <input type="text" id="new-project" placeholder="e.g. [Research]">
        <button id="add-project-btn">Add</button>
      </div>
    </section>
```

- [ ] **Step 2: Commit**

```bash
git add src/options.html
git commit -m "feat: add group input field to options HTML"
```

---

### Task 3: Options JS — Rewrite for Grouped Rendering and CRUD

**Files:**
- Modify: `src/options.js` (full rewrite of project-related logic, lines 1-113)

This is the largest task. It replaces the flat `renderProjects` and all project CRUD with group-aware equivalents.

- [ ] **Step 1: Update element references at top of file**

Replace lines 1-6:
```js
const calendarNameInput = document.getElementById('calendar-name');
const saveCalendarBtn = document.getElementById('save-calendar-btn');
const projectList = document.getElementById('project-list');
const newProjectInput = document.getElementById('new-project');
const addProjectBtn = document.getElementById('add-project-btn');
const status = document.getElementById('status');
```

With:
```js
const calendarNameInput = document.getElementById('calendar-name');
const saveCalendarBtn = document.getElementById('save-calendar-btn');
const groupListEl = document.getElementById('group-list');
const newProjectInput = document.getElementById('new-project');
const addProjectBtn = document.getElementById('add-project-btn');
const newGroupInput = document.getElementById('new-group');
const addGroupBtn = document.getElementById('add-group-btn');
const status = document.getElementById('status');
```

- [ ] **Step 2: Add state variables and helper after `migrateToGroups`**

Insert after the `migrateToGroups` function:

```js
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
```

- [ ] **Step 3: Replace the entire `renderProjects` function (lines 31-88) with `renderGroups`**

Delete lines 29-88 (the `let dragSrcIndex = null;` through the end of `renderProjects`). Replace with:

```js
let dragType = null; // 'project' or 'group'
let dragSourceGroupId = null;
let dragSourceProjectIndex = null;
let dragSourceGroupIndex = null;

function renderGroups(updatedGroups) {
  if (updatedGroups) groups = updatedGroups;
  groupListEl.innerHTML = '';

  groups.forEach((group, groupIndex) => {
    const isUncategorized = group.id === 'uncategorized';

    // --- Group header ---
    const header = document.createElement('div');
    header.className = 'group-header' + (isUncategorized ? ' group-uncategorized' : '');
    header.dataset.groupIndex = groupIndex;

    if (!isUncategorized) {
      header.draggable = true;

      header.addEventListener('dragstart', (e) => {
        dragType = 'group';
        dragSourceGroupIndex = groupIndex;
        header.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      header.addEventListener('dragend', () => {
        header.classList.remove('dragging');
        groupListEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        dragType = null;
        dragSourceGroupIndex = null;
      });
    }

    // Drop target for groups (reorder) and projects (move into group)
    header.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      header.classList.add('drag-over');
    });
    header.addEventListener('dragleave', () => {
      header.classList.remove('drag-over');
    });
    header.addEventListener('drop', (e) => {
      e.preventDefault();
      header.classList.remove('drag-over');

      if (dragType === 'group' && dragSourceGroupIndex !== null) {
        // Reorder group — cannot drop onto uncategorized position
        if (isUncategorized || dragSourceGroupIndex === groupIndex) return;
        const [moved] = groups.splice(dragSourceGroupIndex, 1);
        groups.splice(groupIndex, 0, moved);
        saveGroups(() => renderGroups());
      } else if (dragType === 'project' && dragSourceGroupId !== null) {
        // Move project into this group (at end)
        const srcGroup = groups.find(g => g.id === dragSourceGroupId);
        if (!srcGroup || srcGroup.id === group.id) return;
        const [movedProject] = srcGroup.projects.splice(dragSourceProjectIndex, 1);
        group.projects.push(movedProject);
        saveGroups(() => renderGroups());
      }
    });

    // Grip (only for named groups)
    if (!isUncategorized) {
      const grip = document.createElement('span');
      grip.className = 'drag-grip';
      grip.textContent = '⠿';
      header.appendChild(grip);
    }

    // Group name (editable for named groups)
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

        const commit = () => {
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

    // Project count
    const count = document.createElement('span');
    count.className = 'group-count';
    count.textContent = `${group.projects.length} project${group.projects.length !== 1 ? 's' : ''}`;
    header.appendChild(count);

    // Delete button (not for uncategorized)
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

    groupListEl.appendChild(header);

    // --- Project rows under this group ---
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
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        groupListEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        dragType = null;
        dragSourceGroupId = null;
        dragSourceProjectIndex = null;
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

        if (dragType === 'project' && dragSourceGroupId !== null) {
          const srcGroup = groups.find(g => g.id === dragSourceGroupId);
          if (!srcGroup) return;
          const [movedProject] = srcGroup.projects.splice(dragSourceProjectIndex, 1);
          // Insert into target group at this position
          const targetGroup = groups.find(g => g.id === group.id);
          let insertIndex = projectIndex;
          // If moving within the same group and source was before target, adjust index
          if (srcGroup.id === targetGroup.id && dragSourceProjectIndex < projectIndex) {
            insertIndex--;
          }
          targetGroup.projects.splice(insertIndex, 0, movedProject);
          saveGroups(() => renderGroups());
        } else if (dragType === 'group') {
          // Group dropped on a project row — treat as dropping on the group header
          if (isUncategorized || dragSourceGroupIndex === groupIndex) return;
          const [moved] = groups.splice(dragSourceGroupIndex, 1);
          groups.splice(groupIndex, 0, moved);
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
      groupListEl.appendChild(row);
    });
  });
}
```

- [ ] **Step 4: Replace "Add Project" handler (lines 90-109)**

Delete lines 90-109 and replace with:

```js
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
```

- [ ] **Step 5: Add "Add Group" handler**

Insert after the "Add Project" handler:

```js
addGroupBtn.addEventListener('click', () => {
  const name = newGroupInput.value.trim();
  if (!name) return;
  const duplicate = groups.some(g => g.name.toLowerCase() === name.toLowerCase());
  if (duplicate) {
    showStatus('Group already exists');
    return;
  }
  const newGroup = { id: generateGroupId(), name, projects: [] };
  // Insert before "uncategorized" (which is always last)
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
```

- [ ] **Step 6: Verify the page loads without errors**

Open the extension options page (`chrome-extension://<id>/options.html`) in a browser. Check:
- Migration runs (existing projects appear under "Other")
- Groups render with headers and indented projects
- Add Group works
- Add Project adds to "Other"
- Remove project works
- Delete group moves projects to "Other"
- Drag project within group reorders
- Drag project to different group moves it
- Drag group header reorders groups
- Double-click group name to rename
- "Other" group: no grip, no delete, no rename

- [ ] **Step 7: Commit**

```bash
git add src/options.js
git commit -m "feat: rewrite options.js for grouped project management"
```

---

### Task 4: Options CSS — Group Header and Indented Row Styles

**Files:**
- Modify: `src/options.css` (add new styles after existing ones)

- [ ] **Step 1: Add group-related CSS at the end of options.css**

Append after line 93 (end of file):

```css

.add-group {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.add-group input { flex: 1; }

.group-header {
  display: flex;
  align-items: center;
  padding: 0.5rem 0.5rem;
  background: #f8f9fa;
  border-bottom: 1px solid #e0e0e0;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: grab;
  user-select: none;
  gap: 0.5rem;
}
.group-header:active { cursor: grabbing; }
.group-header.dragging { opacity: 0.4; }
.group-header.drag-over { border-top: 2px solid #1a73e8; }

.group-uncategorized {
  background: #fffbe6;
  cursor: default;
  font-style: italic;
}
.group-uncategorized:active { cursor: default; }

.group-name {
  flex: 1;
  cursor: pointer;
}
.group-uncategorized .group-name {
  cursor: default;
}

.group-rename-input {
  flex: 1;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 0.15rem 0.3rem;
  border: 1px solid #1a73e8;
  border-radius: 3px;
  outline: none;
}

.group-count {
  font-size: 0.75rem;
  font-weight: normal;
  color: #999;
  margin-left: auto;
}

.group-delete-btn {
  background: none;
  color: #d93025;
  font-size: 0.85rem;
  padding: 0.15rem 0.4rem;
  cursor: pointer;
  border: none;
  line-height: 1;
}
.group-delete-btn:hover {
  background: #fce8e6;
  border-radius: 3px;
}

.project-row-grouped {
  padding-left: 2rem;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/options.css
git commit -m "style: add group header and indented project row styles"
```

---

### Task 5: Content JS — Migration and Read Groups

**Files:**
- Modify: `src/content.js:66,274,375` (three locations that read `projects` from storage)

This task updates content.js to read `groups` instead of `projects` and perform migration if needed.

- [ ] **Step 1: Add migration helper at the top of content.js**

Insert after line 8 (`let lastDateHeader = '';`):

```js
function migrateToGroups(data) {
  if (data.groups) return data.groups;
  const projects = data.projects || [];
  return [{ id: 'uncategorized', name: 'Other', projects }];
}

function flattenGroups(groups) {
  return groups.flatMap(g => g.projects);
}

function hasNamedGroups(groups) {
  return groups.some(g => g.id !== 'uncategorized');
}
```

- [ ] **Step 2: Update `injectTracker` to read groups (line 66)**

Replace line 66:
```js
  chrome.storage.sync.get({ projects: [], calendarName: '' }, ({ projects, calendarName }) => {
    if (projects.length === 0) return;
```

With:
```js
  chrome.storage.sync.get({ groups: null, projects: null, calendarName: '' }, (data) => {
    const groups = migrateToGroups(data);
    if (!data.groups) {
      chrome.storage.sync.set({ groups }, () => chrome.storage.sync.remove('projects'));
    }
    const allProjects = flattenGroups(groups);
    if (allProjects.length === 0) return;
    const calendarName = data.calendarName || '';
```

- [ ] **Step 3: Update pill rendering to show grouped layout**

Replace lines 111-128 (the `const pills` through the end of the `projects.forEach` loop):

```js
    const pills = document.createElement('div');
    pills.className = 'gcal-tracker-pills';

    const showLabels = hasNamedGroups(groups);

    groups.forEach(group => {
      if (group.projects.length === 0) return;

      if (showLabels) {
        const groupRow = document.createElement('div');
        groupRow.className = 'gcal-tracker-group-row';

        const label = document.createElement('span');
        label.className = 'gcal-tracker-group-label';
        if (group.id === 'uncategorized') label.classList.add('gcal-tracker-group-label-other');
        label.textContent = group.name;
        groupRow.appendChild(label);

        const pillsWrap = document.createElement('div');
        pillsWrap.className = 'gcal-tracker-group-pills';

        group.projects.forEach(project => {
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
            fillProject(popup, project, calendar?.encodedId, btn, tracker);
          });
          pillsWrap.appendChild(btn);
        });

        groupRow.appendChild(pillsWrap);
        pills.appendChild(groupRow);
      } else {
        // Single group (only "Other") — flat layout, no labels
        group.projects.forEach(project => {
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
            fillProject(popup, project, calendar?.encodedId, btn, tracker);
          });
          pills.appendChild(btn);
        });
      }
    });
```

- [ ] **Step 4: Update `scanWeeklyEvents` to accept flat project list (line 274)**

No signature change needed — `scanWeeklyEvents` already takes `(calendarName, projects)` as a flat array. The callers will pass `flattenGroups(groups)`.

- [ ] **Step 5: Update `refreshSummary` to read groups (line 375)**

Replace line 375:
```js
    chrome.storage.sync.get({ projects: [], calendarName: '', summaryCollapsed: false }, (settings) => {
```

With:
```js
    chrome.storage.sync.get({ groups: null, projects: null, calendarName: '', summaryCollapsed: false }, (data) => {
      const groups = migrateToGroups(data);
      if (!data.groups) {
        chrome.storage.sync.set({ groups }, () => chrome.storage.sync.remove('projects'));
      }
      const settings = { groups, calendarName: data.calendarName || '', summaryCollapsed: data.summaryCollapsed || false };
```

- [ ] **Step 6: Update references to `settings.projects` inside `refreshSummary`**

Replace line 390-391:
```js
    if (settings.projects.length === 0) {
```

With:
```js
    const allProjects = flattenGroups(settings.groups);
    if (allProjects.length === 0) {
```

Replace line 420-421 (inside the retry interval):
```js
            const results = scanWeeklyEvents(settings.calendarName, settings.projects);
            renderSummaryBody(body, results, cal.color);
```

With:
```js
            const results = scanWeeklyEvents(settings.calendarName, allProjects);
            renderSummaryBody(body, results, cal.color, settings.groups);
```

Replace line 428-429 (the final scan call):
```js
    const results = scanWeeklyEvents(settings.calendarName, settings.projects);
    renderSummaryBody(body, results, calendar.color);
```

With:
```js
    const results = scanWeeklyEvents(settings.calendarName, allProjects);
    renderSummaryBody(body, results, calendar.color, settings.groups);
```

- [ ] **Step 7: Update storage change listener (line 576-579)**

Replace:
```js
    if (changes.projects || changes.calendarName) {
```

With:
```js
    if (changes.groups || changes.calendarName) {
```

- [ ] **Step 8: Commit**

```bash
git add src/content.js
git commit -m "feat: update content.js to read groups and render grouped pills"
```

---

### Task 6: Content JS — Grouped Left Nav Summary Rendering

**Files:**
- Modify: `src/content.js` — `renderSummaryBody` function (lines 305-359)

- [ ] **Step 1: Rewrite `renderSummaryBody` to accept groups and render with section headers**

Replace the entire `renderSummaryBody` function (lines 305-359) with:

```js
function renderSummaryBody(body, results, calColor, groups) {
  body.innerHTML = '';

  const hasAnyTime = Object.values(results).some(v => v > 0);
  if (!hasAnyTime) {
    const empty = document.createElement('div');
    empty.className = 'tts-empty';
    empty.textContent = 'No tracked time this week';
    body.appendChild(empty);
    return;
  }

  let total = 0;
  const showLabels = hasNamedGroups(groups);

  groups.forEach(group => {
    // Check if any project in this group has time
    const groupHasTime = group.projects.some(p => results[p] > 0);
    if (!groupHasTime) return;

    if (showLabels) {
      const labelEl = document.createElement('div');
      labelEl.className = 'tts-group-label';
      if (group.id === 'uncategorized') labelEl.classList.add('tts-group-label-other');
      labelEl.textContent = group.name;
      body.appendChild(labelEl);
    }

    group.projects.forEach(project => {
      const minutes = results[project] || 0;
      if (minutes <= 0) return;
      total += minutes;

      const row = document.createElement('div');
      row.className = 'tts-row';

      const label = document.createElement('span');
      label.className = 'tts-label';

      if (calColor) {
        const dot = document.createElement('span');
        dot.className = 'tts-dot';
        dot.style.backgroundColor = calColor;
        label.appendChild(dot);
      }

      const text = document.createElement('span');
      text.textContent = project;
      label.appendChild(text);

      row.appendChild(label);
      row.appendChild(createDurationEl(minutes));
      body.appendChild(row);
    });
  });

  // Uncategorized events (not matching any project)
  if (results['_uncategorized'] > 0) {
    total += results['_uncategorized'];

    const row = document.createElement('div');
    row.className = 'tts-row';

    const label = document.createElement('span');
    label.className = 'tts-label';
    const text = document.createElement('span');
    text.textContent = 'Uncategorized';
    text.style.fontStyle = 'italic';
    text.style.color = '#80868b';
    label.appendChild(text);

    row.appendChild(label);
    row.appendChild(createDurationEl(results['_uncategorized']));
    body.appendChild(row);
  }

  if (total > 0) {
    const divider = document.createElement('div');
    divider.className = 'tts-divider';
    body.appendChild(divider);

    const totalRow = document.createElement('div');
    totalRow.className = 'tts-row tts-total';
    const totalLabel = document.createElement('span');
    totalLabel.className = 'tts-label';
    totalLabel.textContent = 'Total';
    totalRow.appendChild(totalLabel);
    totalRow.appendChild(createDurationEl(total));
    body.appendChild(totalRow);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/content.js
git commit -m "feat: render grouped summary stats in left nav"
```

---

### Task 7: Content CSS — Group Label Styles

**Files:**
- Modify: `src/content.css` (append new styles)

- [ ] **Step 1: Add group label styles for quick-create popup**

Append after line 67 (end of the quick-create section, before the `/* --- Time Tracking Summary */` comment):

```css

.gcal-tracker-group-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 2px 0;
}

.gcal-tracker-group-label {
  font-size: 11px;
  color: #80868b;
  font-weight: 500;
  min-width: 70px;
  padding-top: 5px;
  flex-shrink: 0;
}

.gcal-tracker-group-label-other {
  font-style: italic;
}

.gcal-tracker-group-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
```

- [ ] **Step 2: Add group label styles for left nav summary**

Append at the end of the file (after line 169):

```css

.tts-group-label {
  font-size: 10px;
  font-weight: 600;
  color: #80868b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 6px 0 2px;
}

.tts-group-label-other {
  font-style: italic;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/content.css
git commit -m "style: add group label styles for popup and left nav"
```

---

### Task 8: End-to-End Verification

**Files:** None (testing only)

- [ ] **Step 1: Load the extension in Chrome**

Go to `chrome://extensions`, enable Developer Mode, click "Load unpacked", select the `src/` directory (or reload if already loaded).

- [ ] **Step 2: Verify options screen**

1. Open extension options
2. If you had existing projects, confirm they appear under "Other" (migration worked)
3. Create a new group (e.g., "Engineering")
4. Add a new project — confirm it appears under "Other"
5. Drag the project from "Other" to "Engineering"
6. Create another group, drag to reorder group headers
7. Double-click a group name to rename it
8. Delete a group — confirm projects move to "Other"
9. Confirm "Other" has no drag grip, no delete button, italic name

- [ ] **Step 3: Verify quick-create popup**

1. Go to Google Calendar, click a time slot to open quick-create
2. Confirm pills appear grouped with labels (if 2+ groups exist)
3. Confirm clicking a pill still fills the title and selects the calendar
4. Remove all named groups (only "Other" left) — confirm pills show flat without labels

- [ ] **Step 4: Verify left nav summary**

1. Confirm summary section shows group labels as uppercase section headers
2. Confirm projects are listed under their group
3. Confirm groups with 0 time are hidden
4. Confirm "Uncategorized" events row still appears before Total
5. With only "Other" group — confirm no labels, same as before

- [ ] **Step 5: Commit any fixes if needed**

```bash
git add src/
git commit -m "fix: address issues found during end-to-end testing"
```
