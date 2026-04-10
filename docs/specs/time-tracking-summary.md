# Feature Spec: Time Tracking Summary (Leftnav Section)

## Overview

Add a collapsible "Time tracking summary" section to Google Calendar's left sidebar, positioned above the existing "Time Insights" section. It parses the weekly view DOM to sum event durations per configured project and displays the breakdown.

## Scope

- **Weekly view only** -- the section is hidden (or shows a message) on day/month/custom views
- **DOM-based** -- no Calendar API; scrapes rendered events from the week grid
- **Single calendar** -- only counts events belonging to the configured `calendarName`

## Matching Logic

- For each rendered event, extract its title text
- An event matches a project if the title **contains** the project string (case-sensitive, matching existing behavior)
- First match wins (projects checked in configured order)
- Events that match no project go into **"Uncategorized"**
- **All-day and multi-day events are ignored** -- only timed events with start/end

## Duration Extraction

Events in GCal weekly view render with a time chip or aria-label containing times (e.g., `"10:00 - 11:30am"`). The content script will:

1. Parse start/end times from each event's DOM (aria-label or visible time text)
2. Compute duration in minutes
3. Aggregate per project

## Calendar Filtering

- Use the existing `findCalendarByName()` to get the calendar's color
- Only count events whose background/border color matches the configured calendar's color (same approach the extension already uses for color extraction)
- This avoids needing to inspect which calendar an event belongs to via other means

## UI Design

### Placement

Left sidebar, above "Time Insights" section, below the calendar grid/mini-cal area.

### Structure

Mirrors GCal's native collapsible sections:

```
v Time tracking summary          [refresh]
  +-----------------------------+
  | [Research]         4h 30m   |
  | [Design]           2h 15m   |
  | Uncategorized      1h 00m   |
  | --------------------------- |
  | Total              7h 45m   |
  +-----------------------------+
```

### Behavior

- **Collapse/expand**: Chevron toggle, collapsed state saved to `chrome.storage.sync`
- **Refresh button**: Small refresh icon in the header for manual re-scan
- **Colors**: Each project row uses the calendar's color as a small dot/indicator
- **Format**: Hours and minutes (`Xh Ym`), e.g. `4h 30m`
- **Only show projects with >0 time**, plus Uncategorized if >0

## Live Update Triggers

The summary re-scans the DOM and updates on:

1. **Week navigation** -- detect URL changes or clicks on forward/back arrows (MutationObserver on the header date range text)
2. **View change** -- hide section if not in weekly view, show when returning
3. **Event mutations** -- MutationObserver on the week grid container to catch event creation/deletion/resize
4. **Settings change** -- `chrome.storage.onChanged` listener to react to project list or calendar name updates

## Data Flow

```
GCal weekly DOM
  -> MutationObserver / navigation detection
  -> scanWeeklyEvents()
  -> filter by calendar color
  -> match titles to projects (contains, first-match)
  -> aggregate durations
  -> render/update summary section
```

## Files Modified

- **`content.js`** -- new functions: `injectSummarySection()`, `scanWeeklyEvents()`, `parseEventDuration()`, `renderSummary()`, navigation/mutation observers
- **`content.css`** -- styles for the sidebar summary section (collapsible header, rows, totals)
- No changes to `manifest.json`, `options.js`, or `background.js`

## Edge Cases

- **No projects configured**: Show section with message "Configure projects in extension options"
- **No calendar configured**: Show warning similar to quick-create popup
- **Calendar not found in sidebar**: Show warning
- **Zero matching events**: Show "No tracked time this week"
- **Weekly view not active**: Hide the section entirely
- **Events spanning midnight within the week**: Count full duration as displayed
