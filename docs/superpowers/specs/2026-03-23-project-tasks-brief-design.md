# Project Tasks & Brief — Design Spec

**Date:** 2026-03-23
**Branch:** feature/project-tasks-brief
**Scope:** Project-level Tasks tab and Brief tab in the project detail page

---

## Problem

The project detail page has a Tasks tab and a Brief tab, both showing "coming soon" placeholders. The `Task` and `Brief` tables exist in the database with `project_ID` foreign keys, but no backend endpoints or frontend logic connects them to the UI.

---

## Approach

Dedicated lazy-load endpoints (Option B):

- `GET /api/projects/{id}/tasks` — returns tasks filtered by `project_ID`
- `GET /api/projects/{id}/brief` — returns the most recent brief filtered by `project_ID`

Each endpoint is fetched only when the user activates the respective tab. Results are cached client-side for the duration of the project detail session (reset when a new project is opened).

---

## Database Schema

**Task table** (existing, no changes):
| Column | Type |
|---|---|
| task_ID | nvarchar(50) |
| content | nvarchar(max) |
| status | nvarchar(50) |
| priority | nvarchar(50) |
| project_ID | nvarchar(50) |
| event_ID | nvarchar(50) |
| shift_ID | nvarchar(50) |

**Brief table** (existing, no changes):
| Column | Type |
|---|---|
| brief_ID | nvarchar(50) |
| title | nvarchar(255) |
| content | nvarchar(max) |
| created_at | datetime2 |
| created_by_manager_user_ID | nvarchar(50) |
| project_ID | nvarchar(50) |
| event_ID | nvarchar(50) |
| shift_ID | nvarchar(50) |

Scope: filter by `project_ID` only. Ignore `event_ID` and `shift_ID` for this feature.

---

## Backend

### New DTOs

**`TaskItem.cs`**
```csharp
public class TaskItem
{
    public string TaskId   { get; set; }
    public string Content  { get; set; }
    public string Status   { get; set; }
    public string Priority { get; set; }
}
```

**`ProjectBriefResponse.cs`**
```csharp
public class ProjectBriefResponse
{
    public string   BriefId   { get; set; }
    public string   Title     { get; set; }
    public string   Content   { get; set; }
    public DateTime CreatedAt { get; set; }  // always present; Brief.created_at is non-nullable in DB
}
```

### Repository (`ProjectRepository.cs`)

Two new methods added to `IProjectRepository` and implemented in `ProjectRepository.cs`:

**`GetTasksByProjectIdAsync(projId, managerUserId)`**
- First verifies manager has access via `Manager_Project` (throws `UnauthorizedAccessException` if not; returns null if project doesn't exist)
- `SELECT task_ID, content, status, priority FROM Task WHERE project_ID = @projId ORDER BY task_ID ASC` — deterministic ordering by ID
- Returns `IEnumerable<TaskItem>` (empty if no tasks)

**`GetBriefByProjectIdAsync(projId, managerUserId)`**
- Same access check
- `SELECT TOP 1 brief_ID, title, content, created_at FROM Brief WHERE project_ID = @projId ORDER BY created_at DESC`
- Returns `ProjectBriefResponse?` (null if none found)

### Service (`ProjectService.cs`)

Two new pass-through methods added to `IProjectService` and `ProjectService`:

- `GetProjectTasksAsync(firebaseUid, projId)` — resolves manager user ID, delegates to repository
- `GetProjectBriefAsync(firebaseUid, projId)` — same pattern

### Controller (`ProjectsController.cs`)

Two new actions:

```
GET /api/projects/{id}/tasks
  → 200 TaskItem[]            (tasks is a collection — returns empty array when none exist, never 404 for empty)
  → 401 if no valid token
  → 403 if manager doesn't have access to the project
  → 404 if the project itself doesn't exist

GET /api/projects/{id}/brief
  → 200 ProjectBriefResponse  (a brief is a single entity — 404 when absent, never 200 with null)
  → 401 if no valid token
  → 403 if manager doesn't have access to the project
  → 404 if no brief exists for this project, or if the project itself doesn't exist
```

The asymmetry between tasks (200 + empty array) and brief (404 when absent) is intentional: tasks is a collection resource, brief is a singular resource. Both endpoints follow the same auth-check order: resolve manager user ID → verify project exists (404 if not) → verify manager has access (403 if not) → return data.

Both follow the existing try/catch pattern in `ProjectsController`.

---

## Frontend

### State (`manager-dashboard.js`)

Two new module-level flags added alongside `currentProjectDetail` and `_pdCalendar`:

```js
let _pdTasksLoaded = false;
let _pdBriefLoaded = false;
```

Both reset to `false` at the start of `openProjectDetail()`, regardless of which project was previously open.

### Tab activation (`activateProjectTab`)

Extend the existing function:

```js
if (name === 'tasks')  renderTasksTab();
if (name === 'brief')  renderBriefTab();
```

Mirrors the existing `if (name === 'schedule') renderScheduleCalendar()` pattern.

### `renderTasksTab()`

1. If `_pdTasksLoaded === true` → return immediately (panel already rendered; do not re-fetch or re-render)
2. Set `_pdTasksLoaded = true` (prevents double-fire on rapid tab clicks)
3. Get Firebase ID token via the existing `auth.currentUser.getIdToken()` pattern used throughout `manager-dashboard.js`
4. Fetch `GET /api/projects/{currentProjectDetail.projId}/tasks`
5. Clear the panel's existing HTML content, then render:
   - If empty array → "No tasks found for this project."
   - Otherwise → a `.pd-task-list`; each `.pd-task-row` shows `content` on the left, `status` and `priority` as `.pd-badge` spans on the right
6. On fetch/network error → clear panel and render "Failed to load — please try again"

### `renderBriefTab()`

1. If `_pdBriefLoaded === true` → return immediately (do not re-fetch or re-render)
2. Set `_pdBriefLoaded = true`
3. Get Firebase ID token via the same existing pattern
4. Fetch `GET /api/projects/{currentProjectDetail.projId}/brief`
5. Clear the panel's existing HTML content, then render:
   - On HTTP 200 → `title` as `<h3>`, `content` as `<p>`, `created_at` as `.pd-brief-meta` below content
   - On HTTP 404 → "No brief available for this project."
6. On fetch/network error → clear panel and render "Failed to load — please try again"

### Styling (`manager-dashboard.css`)

Minimal additions only — no redesign:

- `.pd-task-list` — simple vertical list container
- `.pd-task-row` — flex row: content on left, badges on right
- `.pd-badge` — small inline badge (reuse or mirror existing badge style)
- `.pd-brief-title` — heading style for brief title
- `.pd-brief-meta` — small muted text for `created_at`

---

## Data Flow

```
openProjectDetail(projId)
  └─ _pdTasksLoaded = false, _pdBriefLoaded = false  ← always reset on project open

user clicks Tasks tab
  └─ activateProjectTab('tasks')
       └─ renderTasksTab()
            ├─ if _pdTasksLoaded → return immediately (already rendered)
            └─ _pdTasksLoaded = true → fetch tasks → clear panel → render

user clicks Brief tab
  └─ activateProjectTab('brief')
       └─ renderBriefTab()
            ├─ if _pdBriefLoaded → return immediately (already rendered)
            └─ _pdBriefLoaded = true → fetch brief → clear panel → render
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| No tasks for project | Empty state: "No tasks found for this project." |
| No brief for project | 404 → show: "No brief available for this project." |
| Network/server error | Inline message in panel: "Failed to load — please try again" |

---

## Validation (Playwright)

1. Open a project detail page
2. Click Tasks tab → verify task rows render with content/status/priority; no console errors
3. Click Tasks tab again → verify no second network request fires (cache check)
4. Click Brief tab → verify brief title and content render
5. Click Brief tab again → verify no second fetch
6. Verify all other tabs (Dashboard, Employees, Schedule) still work correctly

---

## Constraints

- No database schema changes
- No changes to existing `ProjectDetailResponse` DTO
- No new files except DTOs; all other changes extend existing files
- No new features beyond read-only display of tasks and brief
