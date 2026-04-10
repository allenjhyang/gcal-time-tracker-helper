# Project Groupings Feature — Design Spec

## Overview

Allow users to organize their time-tracking projects into named groups. Groups affect three surfaces: the options screen (where groups are defined), the GCal quick-create popup (where pills are displayed by group), and the left nav summary stats (where time breakdowns are organized by group).

## Data Model

### Current storage schema

```js
{
  projects: string[],
  calendarName: string,
  summaryCollapsed: boolean
}
```

### New storage schema

```js
{
  groups: [
    {
      id: string,        // stable unique ID, e.g. "g_1712345678"
      name: string,      // display name, e.g. "Engineering"
      projects: string[] // ordered project names within this group
    }
  ],
  calendarName: string,
  summaryCollapsed: boolean
}
```

- `groups` is an ordered array. Position in the array determines display order everywhere.
- The **"Other" group** uses the sentinel ID `"uncategorized"` and is always the last element in the array. It cannot be reordered, renamed, or deleted.
- Each group has a stable `id` so references survive renames.
- The old `projects` key is removed after migration.

### Migration

Both `options.js` and `content.js` read from storage on load. Each should check for the old format and migrate if needed (idempotent — if `groups` already exists, skip):

1. Read storage. If `groups` exists, done.
2. If `projects` exists but `groups` does not, create `groups: [{ id: "uncategorized", name: "Other", projects: [...existingProjects] }]`.
3. Write `groups` to storage and remove the `projects` key.

This is automatic and one-time. Existing users see no visible change until they create a named group. Both files share the same migration logic (extract to a helper function or duplicate the small check).

## Options Screen

### Group management

- **"Add Group" input + button** above the project list. Same pattern as the existing "Add Project" flow.
- Duplicate group names are prevented with a validation message.

### List structure

Each group renders as a **section header** followed by its projects:

**Group header row** (gray background):
- Drag grip (⠿) for reordering the entire group
- Group name — click-to-edit for inline renaming, confirmed on Enter or blur
- Project count label (e.g., "3 projects"), right-aligned, muted
- Delete button (✕) — deletes the group, moves all its projects to "Other"

**"Other" group header**:
- No drag grip (pinned to bottom, cannot be reordered)
- No delete button (permanent)
- No rename (always "Other")
- Name displayed in italic to distinguish from named groups

**Project rows** (indented under their group):
- Drag grip (⠿), project name, remove button — same as current design
- Indented relative to the group header

### "Add Project" input

Stays at the bottom, same as today. New projects are added to the "Other" group by default. Users drag them into named groups as desired.

### Drag-and-drop behavior

Three drag interactions:

1. **Project within same group** — reorder within the group
2. **Project to different group** — dragging a project over a different group's header or between its projects moves the project into that group
3. **Group header** — reorders the entire group with all its projects

Visual feedback uses the existing pattern (blue border on drop target). The "Other" group header is not draggable but is a valid drop target for projects.

## Quick-Create Popup

### Layout

```
Time tracking                    ⚙
┌─────────────────────────────────────┐
│ Engineering: [Research] [Code Review] │
│ Creative:    [Design]                 │
│ Other:       [Planning]               │
└─────────────────────────────────────┘
```

- Each group renders as a row: group name label followed by project pill buttons.
- Group labels are plain text, not interactive. Styled smaller and lighter than pills (11px, `#80868b`, font-weight 500).
- Groups appear in the same order as the options screen. "Other" always last.
- Groups with zero projects are hidden (no empty rows).
- Pills retain their current styling (calendar color background, contrasting text, click to fill event).

### Single-group fallback

If only the "Other" group exists (no named groups), group labels are not rendered. The layout is identical to the current flat pill list. Labels appear only when there are 2+ groups.

## Left Nav Summary Stats

### Layout

- **Group labels** appear as small uppercase section headers above their projects.
  - Style: 10px, font-weight 600, `#80868b`, uppercase, 0.5px letter-spacing.
  - Matches GCal's native label aesthetic.
- Projects listed under their group with the existing dot + name + duration format.
- Same order as options screen.
- "Other" label in italic.

### Visibility rules

- Groups with 0 tracked time this week are hidden entirely.
- "Uncategorized" row (events on the tracked calendar that don't match any project) still appears after all groups, before the Total divider.
- Single-group fallback: if only "Other" exists, no group labels are shown. Identical to current layout.

### Existing behavior preserved

- Collapse/expand toggle and persistence unchanged.
- Total row at the bottom unchanged.
- Loading states and live update observers unchanged.
- Warning states (no calendar configured, calendar not found) unchanged.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Empty named group | Visible in options (user may drag projects in). Hidden in quick-create and left nav. |
| Duplicate group name | Prevented at creation and rename with validation message. |
| Group rename to existing name | Prevented with validation message. |
| Delete group with projects | Projects move to "Other" group. |
| All projects removed from named group | Group persists in options. Hidden in quick-create and left nav. |
| Chrome sync storage limits | `groups` array adds ~30-50 bytes per group. Well within 102KB total / 8KB per-item limits for realistic usage. |

## Files to modify

| File | Changes |
|------|---------|
| `src/options.js` | Group CRUD, inline rename, updated drag-and-drop (3 interactions), migration logic, render grouped list |
| `src/options.html` | Add "Add Group" input/button, update list container structure |
| `src/options.css` | Group header styles, indented project rows, rename input styles |
| `src/content.js` | Read `groups` instead of `projects`, render grouped pills in quick-create, render grouped stats in left nav |
| `src/content.css` | Group label styles for quick-create rows and left nav section headers |

No changes needed to `manifest.json` or `background.js`.
