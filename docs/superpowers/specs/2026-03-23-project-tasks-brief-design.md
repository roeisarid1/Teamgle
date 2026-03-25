# Project Tasks & Brief — Design Spec (Full CRUD)

**Date:** 2026-03-23
**Branch:** feature/project-task-brief-management
**Scope:** Full CRUD for Project-level Tasks and Briefs inside the project detail page

---

## Problem

The project detail page has a Tasks tab and a Brief tab, both showing "coming soon" placeholders. The `Task` and `Brief` tables exist in the database with full data (23 tasks, 6 briefs), but no backend endpoints or frontend logic connects them to the UI. This spec replaces the previous read-only design with full CRUD.

---

## Database Schema (Confirmed via DB Inspection)

### Task table (existing, no changes)

| Column     | Type          | Nullable | Notes                    |
|------------|---------------|----------|--------------------------|
| task_ID    | nvarchar(100) | NO       | PK                       |
| priority   | nvarchar(100) | NO       | CHECK: low/medium/high/urgent |
| content    | nvarchar(max) | YES      |                          |
| status     | nvarchar(100) | NO       | CHECK: open/in_progress/done/canceled |
| event_ID   | nvarchar(100) | YES      | FK, nullable             |
| project_ID | nvarchar(100) | YES      | FK, nullable             |
| shift_ID   | nvarchar(100) | YES      | FK, nullable             |

**Check constraints (from DB):**
- `status`: `'open'` | `'in_progress'` | `'done'` | `'canceled'`
- `priority`: `'low'` | `'medium'` | `'high'` | `'urgent'`

### Brief table (existing, no changes)

| Column                     | Type          | Nullable | Notes               |
|----------------------------|---------------|----------|---------------------|
| brief_ID                   | nvarchar(100) | NO       | PK                  |
| created_by_manager_user_ID | nvarchar(100) | YES      | FK → [User].user_ID |
| created_at                 | datetime2     | YES      |                     |
| title                      | nvarchar(510) | YES      |                     |
| content                    | nvarchar(max) | YES      |                     |
| event_ID                   | nvarchar(100) | YES      | FK, nullable        |
| project_ID                 | nvarchar(100) | YES      | FK, nullable        |
| shift_ID                   | nvarchar(100) | YES      | FK, nullable        |

**No uniqueness constraint on `project_ID`** — multiple briefs per project are supported and present in existing data.

**Scope:** Filter by `project_ID` only. `event_ID` and `shift_ID` are set to NULL on create. `created_by_manager_user_ID` is resolved server-side from the Firebase token.

---

## Approach

**Inline expand-in-place (matching existing employee/customer pattern):**
- Tasks and Briefs render as a list of row cards
- Clicking anywhere on a row expands it inline to reveal the edit form
- Only one row expanded at a time — expanding a new row collapses the previous
- "Add Task" / "Add Brief" prepend a new blank expanded row at the top
- Delete confirmation replaces only the row actions inline (no modal)
- No page navigation, no modals

---

## Backend API

### Tasks

```
GET    /api/projects/{id}/tasks           → 200 TaskItem[]
POST   /api/projects/{id}/tasks           → 201 TaskItem
PUT    /api/projects/{id}/tasks/{taskId}  → 200 TaskItem
DELETE /api/projects/{id}/tasks/{taskId}  → 204 No Content
```

### Briefs

```
GET    /api/projects/{id}/briefs             → 200 BriefItem[]
POST   /api/projects/{id}/briefs             → 201 BriefItem
PUT    /api/projects/{id}/briefs/{briefId}   → 200 BriefItem
DELETE /api/projects/{id}/briefs/{briefId}   → 204 No Content
```

### Auth & Access Checks (same for all endpoints)

1. Extract Firebase UID from Bearer token → 401 if missing/invalid
2. Verify manager exists (registered in system) → 401 if not
3. Verify project exists → 404 if not
4. Verify manager has access via `Manager_Project` join → 403 if not
5. Perform operation → return result

### Error Responses

| Status | When |
|--------|------|
| 401    | Missing/invalid token, or caller is not a registered manager |
| 403    | Manager exists but has no access to this project |
| 404    | Project not found, or (for PUT/DELETE) task/brief not found |
| 400    | Validation failed (invalid status/priority value, missing required field) |
| 500    | Unexpected server error |

---

## DTOs

### TaskItem (response)

```csharp
public class TaskItem
{
    public string TaskId   { get; set; }
    public string Content  { get; set; }
    public string Status   { get; set; }  // open | in_progress | done | canceled
    public string Priority { get; set; }  // low | medium | high | urgent
}
```

### CreateTaskRequest

```csharp
public class CreateTaskRequest
{
    public string Content  { get; set; }  // required
    public string Status   { get; set; }  // required, validated against allowed values
    public string Priority { get; set; }  // required, validated against allowed values
}
```

### UpdateTaskRequest

```csharp
public class UpdateTaskRequest
{
    public string Content  { get; set; }  // required
    public string Status   { get; set; }  // required, validated
    public string Priority { get; set; }  // required, validated
}
```

### BriefItem (response)

```csharp
public class BriefItem
{
    public string    BriefId              { get; set; }
    public string    Title                { get; set; }
    public string    Content              { get; set; }
    public DateTime? CreatedAt            { get; set; }  // nullable: DB column is datetime2 nullable
    public string    CreatedByManagerId   { get; set; }
    public string?   CreatedByManagerName { get; set; }  // nullable: FK may be null or User deleted
}
```

**Null handling rules:**
- `CreatedAt == null` → frontend renders "—" instead of a formatted date
- `CreatedByManagerName == null` → frontend renders `"Created by: Unknown"`

### CreateBriefRequest

```csharp
public class CreateBriefRequest
{
    public string Title   { get; set; }  // required
    public string Content { get; set; }  // required
}
```

### UpdateBriefRequest

```csharp
public class UpdateBriefRequest
{
    public string Title   { get; set; }  // required
    public string Content { get; set; }  // required
}
```

### Validation constants (server-side)

```csharp
private static readonly HashSet<string> ValidTaskStatuses   = ["open", "in_progress", "done", "canceled"];
private static readonly HashSet<string> ValidTaskPriorities = ["low", "medium", "high", "urgent"];
```

**Content validation:** `content` on Task is required (400 if null or whitespace-only). This is a business rule — the DB column is nullable but we enforce non-empty at the API layer. Similarly, Brief `title` and `content` are both required (400 if null/whitespace).

**Brief edit permission:** Any manager with access to the project may edit or delete any brief for that project (not restricted to the original author). Access check = project membership only.

---

## Backend Implementation Pattern

Follow the existing Controller → Service → Repository layering.

### Repository methods (new)

**Tasks:**
- `GetTasksByProjectIdAsync(projId, fbUid)` → `IEnumerable<TaskItem>?`
- `CreateTaskAsync(projId, request, fbUid)` → `TaskItem`
- `UpdateTaskAsync(taskId, projId, request, fbUid)` → `TaskItem?`
- `DeleteTaskAsync(taskId, projId, fbUid)` → `bool`

**Briefs:**
- `GetBriefsByProjectIdAsync(projId, fbUid)` → `IEnumerable<BriefItem>?`
- `CreateBriefAsync(projId, request, fbUid)` → `BriefItem`
- `UpdateBriefAsync(briefId, projId, request, fbUid)` → `BriefItem?`
- `DeleteBriefAsync(briefId, projId, fbUid)` → `bool`

### Access check pattern (reused across all methods)

```sql
-- 1. Project exists?
SELECT 1 FROM Project WHERE Proj_ID = @projId

-- 2. Manager has access?
SELECT 1
FROM Manager_Project mp
INNER JOIN [User] u ON u.user_ID = mp.manager_user_ID
WHERE mp.project_ID = @projId AND u.FBUID = @fbUid
```

Returns `null` / `false` for 404; throws `UnauthorizedAccessException` for 403.

### Brief GET: resolve manager name

```sql
SELECT b.brief_ID, b.title, b.content, b.created_at,
       b.created_by_manager_user_ID,
       u.firstName + ' ' + u.lastName AS manager_name
FROM Brief b
LEFT JOIN [User] u ON u.user_ID = b.created_by_manager_user_ID
WHERE b.project_ID = @projId
ORDER BY b.created_at DESC  -- NULLs sort last in DESC (SQL Server default) — acceptable behavior
```

**Null handling in ADO.NET reader:** Use `reader.IsDBNull("created_at") ? (DateTime?)null : reader.GetDateTime(...)` and `reader.IsDBNull("manager_name") ? null : reader.GetString(...)`. The `CreatedByManagerName` null case renders as `"Unknown"` in the frontend.

### Brief CREATE: set server-side fields

```sql
-- Resolve manager user_ID from FBUID first
SELECT user_ID FROM [User] WHERE FBUID = @fbUid

-- Then insert
INSERT INTO Brief (brief_ID, title, content, created_at, created_by_manager_user_ID, project_ID, event_ID, shift_ID)
VALUES (NEWID(), @title, @content, GETUTCDATE(), @managerUserId, @projId, NULL, NULL)
```

### Task CREATE:

```sql
INSERT INTO Task (task_ID, content, status, priority, project_ID, event_ID, shift_ID)
VALUES (NEWID(), @content, @status, @priority, @projId, NULL, NULL)
```

### Task/Brief UPDATE: verify ownership (same project, access check before update)

PUT returns 404 if the task/brief does not belong to the given `projId`.

### Task/Brief DELETE: same ownership check

DELETE returns 404 if not found or not belonging to this project.

---

## Frontend

### Files changed

| File | What changes |
|------|-------------|
| `frontend/manager-dashboard.html` | Replace tasks/brief placeholder panels with rich HTML structure |
| `frontend/js/manager-dashboard.js` | State + 4 render functions + 8 CRUD handlers |
| `frontend/css/manager-dashboard.css` | Task/brief list, row, badge, expanded state, animation, responsive |

### State (manager-dashboard.js)

```js
let _pdTasksData   = null;  // TaskItem[] | null (null = not yet loaded)
let _pdBriefsData  = null;  // BriefItem[] | null
let _expandedRow   = null;  // currently expanded DOM row element | null
```

Both data arrays reset to `null` in `openProjectDetail()`. `_expandedRow` also resets to `null` (no `collapseRow()` is called since the DOM is also cleared). Using `null` means the data is always available for re-render after CRUD operations without re-fetching.

**Project switching is safe:** `openProjectDetail()` always calls `activateProjectTab('dashboard')` before resetting state, so tasks/brief panels are hidden when switching projects. In `openProjectDetail()`, also clear the innerHTML of `#pd-task-list` and `#pd-brief-list` (reset to empty string) so no stale DOM remains. When the user subsequently clicks the Tasks tab, `_pdTasksData === null`, so a fresh fetch fires.

### Tab activation hook

```js
if (name === 'tasks')  await renderTasksTab();
if (name === 'brief')  await renderBriefTab();
```

Each render function checks `if (_pdTasksData !== null) return` (skip re-fetch if already loaded — data is live after mutations).

### Interaction rules

- **Single expand:** `_expandedRow` tracks the currently expanded row DOM element. Opening a new row calls `collapseRow(_expandedRow)` first, then sets `_expandedRow` to the newly expanded element.

- **Click to expand:** `click` listener on the entire `.pd-task-row` / `.pd-brief-row` element. The delete button (`.pd-row-delete-btn`) handler must call `event.stopPropagation()` so clicking delete does NOT simultaneously trigger row expansion. The row click handler must also check `if (row.classList.contains('expanded')) return` to avoid toggling on an already-expanded row.

- **Animation:** Use `max-height: 0; overflow: hidden` (collapsed) → `max-height: 500px` (expanded) with `transition: max-height 175ms ease-in-out` on `.pd-row-form`. Do NOT use `display: none` on `.pd-row-form` — it prevents CSS transitions. The HTML template must render `.pd-row-form` without `display: none`; the collapsed state is achieved purely via `max-height: 0`.

- **Hover:** `.pd-task-row:hover` / `.pd-brief-row:hover` → `background: var(--blue-light); cursor: pointer` (only when not expanded or in delete-confirm state)

- **Save disabled:** Compare form field values against the original data object on each `input` / `change` event. Enable Save only when at least one value differs. For new items, Save is always enabled once content is non-empty.

- **Saving state:** While fetch is in-flight: disable all form inputs, set Save button text to "Saving…", disable Cancel button.

- **Delete confirm:** Clicking the delete button (`.pd-row-delete-btn`) replaces only the row's `.pd-row-meta` contents with "Confirm delete?" + "Yes" + "No" buttons. The rest of the row (content, form if expanded) remains unchanged. Row gets class `.pd-row--deleting` → `background: #fef2f2`. "No" restores the original `.pd-row-meta` contents. "Yes" fires the DELETE request → on success: remove row from DOM, splice from data array, set `_expandedRow = null` if it was this row; **if `_pdTasksData.length === 0` (or `_pdBriefsData.length === 0`) after the splice, replace the list container's innerHTML with the empty-state element.** If DELETE fails, restore the original actions and show an inline error.

- **Row update after save (in-place, no element replacement):** After a successful POST or PUT, update the existing row element in-place: update `data-task-id` / `data-brief-id` attributes (for new items), update visible text content, collapse the form, and update `_expandedRow = null`. Do NOT replace the element — this avoids stale `_expandedRow` references.

- **Double "Add" guard:** If an unsaved new row already exists (identifiable by `data-new="true"` attribute), clicking "Add Task"/"Add Brief" again must NOT create a second new row. Either ignore the click, or scroll/focus the existing new row.

### Tasks Tab HTML structure (rendered by JS)

```html
<div class="pd-section-header">
  <h3 class="pd-section-title">Tasks</h3>
  <button class="pd-add-btn" id="btn-add-task">+ Add Task</button>
</div>
<div class="pd-task-list" id="pd-task-list">
  <!-- task rows injected here -->
</div>
```

**Task row (collapsed):**
```html
<div class="pd-task-row" data-task-id="...">
  <div class="pd-row-summary">
    <span class="pd-task-content">Review and approve project timeline</span>
    <div class="pd-row-meta">
      <span class="pd-badge pd-badge--priority pd-badge--high">high</span>
      <span class="pd-badge pd-badge--status pd-badge--open">open</span>
      <button class="pd-row-delete-btn" title="Delete task">✕</button>
    </div>
  </div>
  <div class="pd-row-form"> <!-- collapsed via max-height:0 CSS, NOT display:none -->
    <textarea class="pd-input pd-textarea" name="content">...</textarea>
    <div class="pd-form-row">
      <select class="pd-input pd-select" name="status">
        <option value="open">Open</option>
        <option value="in_progress">In Progress</option>
        <option value="done">Done</option>
        <option value="canceled">Canceled</option>
      </select>
      <select class="pd-input pd-select" name="priority">
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>
    </div>
    <div class="pd-form-actions">
      <button class="pd-btn pd-btn--primary pd-save-btn" disabled>Save</button>
      <button class="pd-btn pd-btn--ghost pd-cancel-btn">Cancel</button>
    </div>
  </div>
</div>
```

### Briefs Tab HTML structure (rendered by JS)

**Brief row (collapsed):**
```html
<div class="pd-brief-row" data-brief-id="...">
  <div class="pd-row-summary">
    <div class="pd-brief-summary-left">
      <span class="pd-brief-title">Dress Code & Conduct Guidelines</span>
      <span class="pd-brief-preview">Staff are required to wear black formal attire...</span>
      <span class="pd-brief-author">Created by: Roee Smith</span>
    </div>
    <div class="pd-row-meta">
      <span class="pd-brief-date">23/03/2026</span>
      <button class="pd-row-delete-btn" title="Delete brief">✕</button>
    </div>
  </div>
  <div class="pd-row-form"> <!-- collapsed via max-height:0 CSS, NOT display:none -->
    <input class="pd-input" type="text" name="title" value="..." />
    <textarea class="pd-input pd-textarea pd-textarea--large" name="content">...</textarea>
    <div class="pd-form-actions">
      <button class="pd-btn pd-btn--primary pd-save-btn" disabled>Save</button>
      <button class="pd-btn pd-btn--ghost pd-cancel-btn">Cancel</button>
    </div>
  </div>
</div>
```

### Empty states

```html
<!-- Tasks -->
<div class="pd-empty-state">
  <span class="material-symbols-outlined">task_alt</span>
  <p>No tasks yet. Start by adding your first task.</p>
</div>

<!-- Briefs -->
<div class="pd-empty-state">
  <span class="material-symbols-outlined">description</span>
  <p>No briefs yet. Start by adding your first brief.</p>
</div>
```

### Add new item flow

1. Click "Add Task" / "Add Brief"
2. **Guard:** if a `data-new="true"` row already exists in the list, do not create another — scroll to and focus it instead
3. Collapse any previously expanded row (`collapseRow(_expandedRow)`)
4. Create a new row element with `data-new="true"` attribute, pre-expanded, empty fields
5. Prepend to the list container
6. Set `_expandedRow` to this new row
7. Save → POST to API → on success: update `data-task-id` / `data-brief-id` attribute on the row element, remove `data-new`, push the returned item into `_pdTasksData` / `_pdBriefsData`, update visible row content in-place, collapse the form, set `_expandedRow = null`
8. Cancel → remove the row element from DOM completely (no API call), set `_expandedRow = null`

---

## Badge Color Coding

### Priority badges

| Value  | Background | Text color |
|--------|------------|------------|
| urgent | `#fef2f2`  | `#ef4444` (red) |
| high   | `#fff7ed`  | `#f97316` (orange) |
| medium | `#eef1fe`  | `#5B7BF0` (blue) |
| low    | `#f0f0f0`  | `#6b7280` (gray) |

### Status badges

| Value       | Background | Text color |
|-------------|------------|------------|
| open        | `#f0f0f0`  | `#6b7280` (gray) |
| in_progress | `#eef1fe`  | `#5B7BF0` (blue) |
| done        | `#f0fdf4`  | `#6FBF73` (green) |
| canceled    | `#fef2f2`  | `#ef4444` (red) |

---

## CSS Additions

Minimal additions to `manager-dashboard.css` only. No new files.

Key new classes:
- `.pd-section-header` — flex row, space-between, header + add button
- `.pd-add-btn` — matches existing blue outline button style
- `.pd-task-list`, `.pd-brief-list` — vertical flex column, gap: 8px
- `.pd-task-row`, `.pd-brief-row` — card with border, border-radius, transition on background
- `.pd-row-summary` — flex row, align-items: center, justify-content: space-between
- `.pd-task-content` — font-size: 14px, font-weight: 500, flex: 1
- `.pd-row-meta` — flex row, gap: 8px, align-items: center, flex-shrink: 0
- `.pd-row-form` — `max-height: 0; overflow: hidden; transition: max-height 175ms ease-in-out; padding: 0` (NOT `display: none` — it breaks CSS transitions)
- `.pd-row-form.expanded` — `max-height: 500px; padding-top: 12px`
- `.pd-badge` — inline pill badge, font-size: 11px, padding: 2px 8px, border-radius: 12px
- `.pd-input`, `.pd-textarea`, `.pd-select` — consistent input styling matching existing modal inputs
- `.pd-form-row` — flex row for select dropdowns
- `.pd-form-actions` — flex row, gap: 8px, margin-top: 12px
- `.pd-btn--primary`, `.pd-btn--ghost` — save/cancel buttons
- `.pd-row--deleting` — `background: #fef2f2` (light red, during delete confirm)
- `.pd-empty-state` — centered, muted, icon + text
- `.pd-brief-preview` — 2-line clamp, muted color, font-size: 13px
- `.pd-brief-author` — font-size: 12px, muted
- `.pd-brief-date` — font-size: 12px, muted

### Responsive (mobile)

```css
@media (max-width: 640px) {
  .pd-row-summary { flex-direction: column; align-items: flex-start; gap: 8px; }
  .pd-row-meta    { width: 100%; justify-content: flex-end; }
  .pd-form-row    { flex-direction: column; }
  .pd-btn         { min-height: 44px; }  /* touch-friendly */
}
```

---

## Data Flow

```
openProjectDetail(projId)
  └─ _pdTasksData = null, _pdBriefsData = null   ← always reset

user clicks Tasks tab
  └─ renderTasksTab()
       ├─ if _pdTasksData !== null → return (already rendered live)
       └─ fetch GET /api/projects/{id}/tasks
            → _pdTasksData = result
            → render task list (or empty state)

user creates a task
  └─ POST /api/projects/{id}/tasks
       → push new TaskItem into _pdTasksData
       → re-render that row in collapsed state

user edits a task
  └─ PUT /api/projects/{id}/tasks/{taskId}
       → update item in _pdTasksData
       → collapse and re-render that row

user deletes a task
  └─ DELETE /api/projects/{id}/tasks/{taskId}
       → remove from _pdTasksData
       → remove row from DOM
       → if _pdTasksData.length === 0, show empty state
```

Same pattern for Briefs.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Network error on load | Inline error message in panel: "Failed to load. Please try again." |
| Save fails (network) | Re-enable form, show error below form: "Failed to save. Please try again." |
| Delete fails | Restore row actions, show error message in row |
| 403 on load | "You don't have access to this project." |
| Empty task list | Empty state: "No tasks yet. Start by adding your first task." |
| Empty brief list | Empty state: "No briefs yet. Start by adding your first brief." |

---

## Future: Employee Brief Acknowledgment

The Brief model is structured to support employee consumption later:

- `created_by_manager_user_ID` is already stored and returned as `CreatedByManagerName`
- `project_ID` links the brief to a project (employees can be linked to projects via `Manager_Project` or future `Employee_Project`)
- When implementing acknowledgment: add an `Employee_Brief_Acknowledgment` junction table (`employee_user_ID`, `brief_ID`, `acknowledged_at`) — no schema changes to `Brief` itself needed
- The GET briefs endpoint can later accept an employee token and return each brief with an `isAcknowledged: bool` flag

---

## Constraints

- No database schema changes
- No new JS libraries
- No modals or page navigation
- All SQL parameterized (no string interpolation)
- IDs generated server-side via `NEWID()`
- `created_by_manager_user_ID` and `project_ID` always set server-side, never trusted from client
