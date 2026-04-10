// Content script for GCal popup detection and project quick-fill

let currentTracker = null;
let summarySection = null;
let summaryCollapsed = false;
let weekObserver = null;
let navObserver = null;
let lastDateHeader = '';

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
  let dialog = null;
  if (node.matches && node.matches('[role="dialog"][data-chips-dialog="true"]')) dialog = node;
  if (!dialog && node.querySelector) dialog = node.querySelector('[role="dialog"][data-chips-dialog="true"]');
  if (!dialog) return null;
  // Only match the "create event" popup (has a title input), not the event detail popup
  if (!dialog.querySelector('input[aria-label="Add title"]')) return null;
  return dialog;
}

function findCalendarByName(calendarName) {
  // Find a calendar in the GCal sidebar by its display name (case-sensitive)
  if (!calendarName) return null;
  const items = document.querySelectorAll('[data-id]');
  for (const item of items) {
    const label = item.querySelector('.toUqff span');
    if (label && label.textContent === calendarName) {
      const encodedId = item.getAttribute('data-id');
      let color = null;
      const checkbox = item.querySelector('[style*="--checkbox-color"]');
      if (checkbox) {
        color = getComputedStyle(checkbox).getPropertyValue('--checkbox-color').trim();
      }
      return { encodedId, color };
    }
  }
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
  chrome.storage.sync.get({ groups: null, projects: null, calendarName: '' }, (data) => {
    const groups = migrateToGroups(data);
    if (!data.groups) {
      chrome.storage.sync.set({ groups }, () => chrome.storage.sync.remove('projects'));
    }
    const allProjects = flattenGroups(groups);
    if (allProjects.length === 0) return;
    const calendarName = data.calendarName || '';

    // Find the scrollable content area to append our buttons at the bottom
    const scrollable = popup.querySelector('[data-bubble-scrollable-root]');
    const container = scrollable || popup;

    // Look up the calendar by name in the sidebar
    const calendar = calendarName ? findCalendarByName(calendarName) : null;
    const calColor = calendar?.color || null;
    const textColor = calColor ? getContrastColor(calColor) : null;

    const tracker = document.createElement('div');
    tracker.id = 'gcal-tracker-buttons';

    const header = document.createElement('div');
    header.className = 'gcal-tracker-header';
    const headerText = document.createElement('span');
    headerText.textContent = 'Time tracking';
    header.appendChild(headerText);
    const settingsLink = document.createElement('a');
    settingsLink.className = 'gcal-tracker-settings';
    settingsLink.href = '#';
    settingsLink.title = 'Open extension settings';
    settingsLink.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>';
    settingsLink.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
    });
    header.appendChild(settingsLink);
    tracker.appendChild(header);

    if (!calendarName) {
      const warning = document.createElement('div');
      warning.className = 'gcal-tracker-warning';
      warning.textContent = 'Set a calendar name in extension options first';
      tracker.appendChild(warning);
    } else if (!calendar) {
      const warning = document.createElement('div');
      warning.className = 'gcal-tracker-warning';
      warning.textContent = `Calendar "${calendarName}" not found in sidebar`;
      tracker.appendChild(warning);
    }

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

    tracker.appendChild(pills);

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

async function fillProject(popup, projectName, encodedCalendarId, clickedBtn, tracker) {
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

  // 2. Select the calendar if found in sidebar
  if (encodedCalendarId) {
    const combobox = popup.querySelector('[role="combobox"][aria-label="Calendar"]');
    if (combobox) {
      combobox.click();
      await delay(300);

      const allOptions = document.querySelectorAll('[role="option"]');
      for (const option of allOptions) {
        if (option.getAttribute('data-value') === encodedCalendarId) {
          option.click();
          break;
        }
      }
    }
  }
}

// --- Time Tracking Summary (leftnav section) ---

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return { h, m };
}

function createDurationEl(minutes) {
  const { h, m } = formatDuration(minutes);
  const wrapper = document.createElement('span');
  wrapper.className = 'tts-value';

  const hSpan = document.createElement('span');
  hSpan.className = 'tts-hours';
  hSpan.textContent = `${h}h`;

  const mSpan = document.createElement('span');
  mSpan.className = 'tts-mins';
  mSpan.textContent = `${m}m`;

  wrapper.appendChild(hSpan);
  wrapper.appendChild(mSpan);
  return wrapper;
}

function parseTimeString(timeStr) {
  if (!timeStr) return null;
  const cleaned = timeStr.trim().toLowerCase().replace(/\s+/g, '');
  const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3];
  if (meridiem === 'pm' && hours !== 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function parseEventChip(eventEl) {
  // The screen-reader div (.XuJrye) inside [data-eventchip] contains all info:
  // "2pm to 3:30pm, [airCFO], Calendar: Time tracking, No location, April 9, 2026"
  const srDiv = eventEl.querySelector('.XuJrye');
  if (!srDiv) return null;
  const text = srDiv.textContent.trim();

  // Extract time range: "2pm to 3:30pm" at the start
  const timeMatch = text.match(
    /^(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+to\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i
  );
  if (!timeMatch) return null; // No time range = all-day event, skip

  const startMin = parseTimeString(timeMatch[1]);
  const endMin = parseTimeString(timeMatch[2]);
  if (startMin === null || endMin === null || endMin <= startMin) return null;

  // Extract calendar name: "Calendar: <name>,"
  const calMatch = text.match(/Calendar:\s*(.+?),/);
  const calendar = calMatch ? calMatch[1].trim() : null;

  // Extract title: the visible title span
  const titleSpan = eventEl.querySelector('.I0UMhf');
  let title = titleSpan ? titleSpan.textContent.trim() : null;

  // Fallback: parse title from screen-reader text (between time and "Calendar:")
  if (!title) {
    const afterTime = text.substring(timeMatch[0].length);
    const titleMatch = afterTime.match(/,\s*(.+?),\s*Calendar:/);
    title = titleMatch ? titleMatch[1].trim() : null;
  }

  return {
    duration: endMin - startMin,
    calendar,
    title,
  };
}

function scanWeeklyEvents(calendarName, projects) {
  const results = {};
  projects.forEach(p => { results[p] = 0; });
  results['_uncategorized'] = 0;

  const allEvents = document.querySelectorAll('[data-eventchip]');

  allEvents.forEach(eventEl => {
    const parsed = parseEventChip(eventEl);
    if (!parsed || !parsed.title || parsed.duration <= 0) return;

    // Filter by calendar name
    if (parsed.calendar !== calendarName) return;

    // Match against projects (first match wins, contains check)
    let matched = false;
    for (const project of projects) {
      if (parsed.title.includes(project)) {
        results[project] += parsed.duration;
        matched = true;
        break;
      }
    }
    if (!matched) {
      results['_uncategorized'] += parsed.duration;
    }
  });

  return results;
}

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

function showLoading(body) {
  body.innerHTML = '';
  const msg = document.createElement('div');
  msg.className = 'tts-loading';
  msg.textContent = 'Calculating\u2026';
  body.appendChild(msg);
}

function refreshSummary(isRetry) {
  if (!summarySection || !document.body.contains(summarySection)) return;

  const body = summarySection.querySelector('.tts-body');
  if (!body) return;

  chrome.storage.sync.get({ groups: null, projects: null, calendarName: '', summaryCollapsed: false }, (data) => {
    const groups = migrateToGroups(data);
    if (!data.groups) {
      chrome.storage.sync.set({ groups }, () => chrome.storage.sync.remove('projects'));
    }
    const settings = { groups, calendarName: data.calendarName || '', summaryCollapsed: data.summaryCollapsed || false };
    const allProjects = flattenGroups(settings.groups);
    summaryCollapsed = settings.summaryCollapsed;
    body.style.display = summaryCollapsed ? 'none' : 'block';
    const icon = summarySection.querySelector('.tts-arrow');
    if (icon) icon.textContent = summaryCollapsed ? 'keyboard_arrow_down' : 'keyboard_arrow_up';

    if (!settings.calendarName) {
      body.innerHTML = '';
      const msg = document.createElement('div');
      msg.className = 'tts-warning';
      msg.textContent = 'Set a calendar name in extension options first';
      body.appendChild(msg);
      return;
    }

    if (allProjects.length === 0) {
      body.innerHTML = '';
      const msg = document.createElement('div');
      msg.className = 'tts-empty';
      msg.textContent = 'Configure projects in extension options';
      body.appendChild(msg);
      return;
    }

    // Calendar may not be in DOM yet — show loading and retry
    const calendar = findCalendarByName(settings.calendarName);
    if (!calendar) {
      if (!isRetry) {
        showLoading(body);
        // Retry a few times as sidebar may still be rendering
        let retries = 0;
        const retryInterval = setInterval(() => {
          retries++;
          if (retries > 10) {
            clearInterval(retryInterval);
            body.innerHTML = '';
            const msg = document.createElement('div');
            msg.className = 'tts-warning';
            msg.textContent = `Calendar "${settings.calendarName}" not found in sidebar`;
            body.appendChild(msg);
            return;
          }
          const cal = findCalendarByName(settings.calendarName);
          if (cal) {
            clearInterval(retryInterval);
            const results = scanWeeklyEvents(settings.calendarName, allProjects);
            renderSummaryBody(body, results, cal.color, settings.groups);
          }
        }, 300);
      }
      return;
    }

    const results = scanWeeklyEvents(settings.calendarName, allProjects);
    renderSummaryBody(body, results, calendar.color, settings.groups);
  });
}

function findTimeInsightsSection() {
  // Find the "Time Insights" native section by its wrapper class .HTosoc
  // which contains a heading with text "Time Insights" in .mqTdDf
  const sections = document.querySelectorAll('.HTosoc');
  for (const section of sections) {
    const title = section.querySelector('.mqTdDf');
    if (title && title.textContent.trim() === 'Time Insights') {
      return section;
    }
  }
  return null;
}

function createSummarySection() {
  const wrapper = document.createElement('div');
  wrapper.id = 'gcal-tts';
  wrapper.className = 'HTosoc';

  // Match the native GCal header structure
  const inner = document.createElement('div');
  const controlDiv = document.createElement('div');
  controlDiv.className = 'gYgcWd';

  // Screen-reader heading
  const h2 = document.createElement('h2');
  h2.className = 'XuJrye';
  h2.tabIndex = -1;
  h2.textContent = 'Time tracking';

  // Wrapper div around button (native has this)
  const pNSpvb = document.createElement('div');
  pNSpvb.className = 'pNSpvb';

  // Visible header button
  const headerBtn = document.createElement('button');
  headerBtn.type = 'button';
  headerBtn.className = 'nUt0vb ukir3 tts-header-btn';

  // Native button has two spans before the content div
  const span1 = document.createElement('span');
  span1.className = 'UTNHae';
  const span2 = document.createElement('span');
  span2.className = 'XjoK4b SIr0ye';

  const btnContent = document.createElement('div');
  btnContent.className = 'x5FT4e kkUTBb';
  const btnInner = document.createElement('div');
  btnInner.className = 'qADfd';
  const titleDiv = document.createElement('div');
  titleDiv.className = 'mqTdDf tts-title';
  const logoImg = document.createElement('img');
  logoImg.src = chrome.runtime.getURL('icons/icon16.png');
  logoImg.className = 'tts-logo';
  logoImg.alt = '';
  titleDiv.appendChild(logoImg);
  titleDiv.appendChild(document.createTextNode('Time tracking'));
  const arrowIcon = document.createElement('i');
  arrowIcon.className = 'google-material-icons notranslate wvnnTb tts-arrow';
  arrowIcon.setAttribute('aria-hidden', 'true');
  arrowIcon.textContent = 'keyboard_arrow_down';

  btnInner.appendChild(titleDiv);
  btnInner.appendChild(arrowIcon);
  btnContent.appendChild(btnInner);
  headerBtn.appendChild(span1);
  headerBtn.appendChild(span2);
  headerBtn.appendChild(btnContent);

  headerBtn.addEventListener('click', () => {
    const body = wrapper.querySelector('.tts-body');
    summaryCollapsed = !summaryCollapsed;
    body.style.display = summaryCollapsed ? 'none' : 'block';
    arrowIcon.textContent = summaryCollapsed ? 'keyboard_arrow_down' : 'keyboard_arrow_up';
    chrome.storage.sync.set({ summaryCollapsed });
  });

  pNSpvb.appendChild(headerBtn);

  // Body content area
  const body = document.createElement('div');
  body.className = 'tts-body';

  controlDiv.appendChild(h2);
  controlDiv.appendChild(pNSpvb);
  controlDiv.appendChild(body);
  inner.appendChild(controlDiv);
  wrapper.appendChild(inner);

  return wrapper;
}

function injectSummarySection() {
  // Already injected and still in DOM
  if (summarySection && document.body.contains(summarySection)) return true;

  const timeInsights = findTimeInsightsSection();
  if (!timeInsights || !timeInsights.parentElement) return false;

  summarySection = createSummarySection();
  timeInsights.parentElement.insertBefore(summarySection, timeInsights);
  refreshSummary();
  return true;
}

function setupSummaryObservers() {
  // Watch for DOM changes anywhere — handles navigation, event edits, sidebar re-renders
  let debounceTimer = null;
  let lastUrl = location.href;

  const observer = new MutationObserver(() => {
    // Check for URL change (week navigation)
    const urlChanged = location.href !== lastUrl;
    if (urlChanged) lastUrl = location.href;

    // If our section got removed, try to re-inject
    if (!summarySection || !document.body.contains(summarySection)) {
      summarySection = null;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        injectSummarySection();
      }, urlChanged ? 500 : 200);
      return;
    }

    // On navigation, show loading immediately then recalculate
    if (urlChanged) {
      const body = summarySection.querySelector('.tts-body');
      if (body && body.style.display !== 'none') {
        showLoading(body);
      }
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refreshSummary, 600);
      return;
    }

    // Debounce refresh for event changes
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(refreshSummary, 800);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Settings changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.groups || changes.calendarName) {
      refreshSummary();
    }
  });
}

function initSummary() {
  // Try to inject immediately; if sidebar isn't ready yet, poll briefly
  if (injectSummarySection()) {
    setupSummaryObservers();
    return;
  }
  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    if (injectSummarySection() || attempts > 30) {
      clearInterval(poll);
      setupSummaryObservers();
    }
  }, 200);
}

// Start observing when the page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    detectPopup();
    initSummary();
  });
} else {
  detectPopup();
  initSummary();
}
