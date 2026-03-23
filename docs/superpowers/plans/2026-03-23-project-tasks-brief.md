# Project Tasks & Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Tasks — coming soon" and "Brief — coming soon" placeholders in the project detail page with live data fetched from the existing `Task` and `Brief` SQL tables via two new lazy-load endpoints.

**Architecture:** Two dedicated read-only endpoints (`GET /api/projects/{id}/tasks` and `GET /api/projects/{id}/brief`) follow the existing Controller → Service → Repository pattern. The frontend fetches each endpoint lazily when the user activates the corresponding tab, caches the result in a boolean flag for the session, and renders inline HTML — mirroring how `renderScheduleCalendar()` already works.

**Tech Stack:** ASP.NET Core 8 / ADO.NET / SQL Server (backend); Vanilla JS + HTML/CSS (frontend); no new libraries.

**Spec:** `docs/superpowers/specs/2026-03-23-project-tasks-brief-design.md`

---

## File Map

| Action | File | What changes |
|--------|------|--------------|
| Create | `backend/Teamgle.Api/Models/DTOs/TaskItem.cs` | New DTO |
| Create | `backend/Teamgle.Api/Models/DTOs/ProjectBriefResponse.cs` | New DTO |
| Modify | `backend/Teamgle.Api/Repositories/IProjectRepository.cs` | Add 2 method signatures |
| Modify | `backend/Teamgle.Api/Repositories/ProjectRepository.cs` | Implement 2 new methods |
| Modify | `backend/Teamgle.Api/Services/IProjectService.cs` | Add 2 method signatures |
| Modify | `backend/Teamgle.Api/Services/ProjectService.cs` | Implement 2 pass-throughs |
| Modify | `backend/Teamgle.Api/Controllers/ProjectsController.cs` | Add 2 new actions |
| Modify | `frontend/js/manager-dashboard.js` | State flags + 2 render functions + tab hook |
| Modify | `frontend/css/manager-dashboard.css` | Minimal new styles for task list and brief |
| Modify | `frontend/manager-dashboard.html` | Clear placeholder content from tasks/brief panels |

---

## Task 1: Create new branch

**Files:**
- (git only)

- [ ] **Step 1: Create and switch to feature branch**

```bash
cd c:/Users/roies/Desktop/Teamgle_App
git checkout -b feature/project-tasks-brief
```

Expected output: `Switched to a new branch 'feature/project-tasks-brief'`

---

## Task 2: Add DTOs

**Files:**
- Create: `backend/Teamgle.Api/Models/DTOs/TaskItem.cs`
- Create: `backend/Teamgle.Api/Models/DTOs/ProjectBriefResponse.cs`

- [ ] **Step 1: Create `TaskItem.cs`**

```csharp
// backend/Teamgle.Api/Models/DTOs/TaskItem.cs
namespace Teamgle.Api.Models.DTOs;

public class TaskItem
{
    public string TaskId   { get; set; } = string.Empty;
    public string Content  { get; set; } = string.Empty;
    public string Status   { get; set; } = string.Empty;
    public string Priority { get; set; } = string.Empty;
}
```

- [ ] **Step 2: Create `ProjectBriefResponse.cs`**

```csharp
// backend/Teamgle.Api/Models/DTOs/ProjectBriefResponse.cs
namespace Teamgle.Api.Models.DTOs;

public class ProjectBriefResponse
{
    public string   BriefId   { get; set; } = string.Empty;
    public string   Title     { get; set; } = string.Empty;
    public string   Content   { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
```

- [ ] **Step 3: Verify the project builds**

```bash
cd backend/Teamgle.Api
dotnet build
```

Expected: `Build succeeded.` with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add backend/Teamgle.Api/Models/DTOs/TaskItem.cs \
        backend/Teamgle.Api/Models/DTOs/ProjectBriefResponse.cs
git commit -m "feat: add TaskItem and ProjectBriefResponse DTOs"
```

---

## Task 3: Add repository methods

**Files:**
- Modify: `backend/Teamgle.Api/Repositories/IProjectRepository.cs`
- Modify: `backend/Teamgle.Api/Repositories/ProjectRepository.cs`

To correctly distinguish "project not found" (→ 404) from "manager has no access" (→ 403), use two separate SQL checks: first verify the project exists, then verify the manager is linked to it.

- [ ] **Step 1: Add method signatures to `IProjectRepository.cs`**

Open `backend/Teamgle.Api/Repositories/IProjectRepository.cs`. The file currently ends at line 23. Add below the `// ── Query ──` section:

```csharp
    // ── Tasks & Brief ──────────────────────────────────────────────────────
    Task<IEnumerable<TaskItem>?> GetTasksByProjectIdAsync(string projId, string firebaseUid);
    Task<ProjectBriefResponse?> GetBriefByProjectIdAsync(string projId, string firebaseUid);
```

The `?` on `IEnumerable<TaskItem>?` signals "null means project not found" (distinct from empty enumerable = project found, no tasks).

- [ ] **Step 2: Implement `GetTasksByProjectIdAsync` in `ProjectRepository.cs`**

Add this method at the end of the class body (before the closing `}`):

```csharp
// ── Get tasks for a project (access-checked) ──────────────────────────
public async Task<IEnumerable<TaskItem>?> GetTasksByProjectIdAsync(string projId, string firebaseUid)
{
    await using var conn = new SqlConnection(_connectionString);
    await conn.OpenAsync();

    // Step 1: Does the project exist?
    const string existsSql = "SELECT 1 FROM Project WHERE Proj_ID = @projId";
    await using (var existsCmd = new SqlCommand(existsSql, conn))
    {
        existsCmd.Parameters.AddWithValue("@projId", projId);
        var exists = await existsCmd.ExecuteScalarAsync();
        if (exists == null) return null; // 404 — project doesn't exist
    }

    // Step 2: Does this manager have access?
    const string accessSql = """
        SELECT 1
        FROM Manager_Project mp
        INNER JOIN [User] u ON u.user_ID = mp.manager_user_ID
        WHERE mp.project_ID = @projId
          AND u.FBUID       = @firebaseUid
        """;
    await using (var accessCmd = new SqlCommand(accessSql, conn))
    {
        accessCmd.Parameters.AddWithValue("@projId",      projId);
        accessCmd.Parameters.AddWithValue("@firebaseUid", firebaseUid);
        var hasAccess = await accessCmd.ExecuteScalarAsync();
        if (hasAccess == null)
            throw new UnauthorizedAccessException("You do not have access to this project.");
    }

    const string taskSql = """
        SELECT task_ID, content, status, priority
        FROM   Task
        WHERE  project_ID = @projId
        ORDER  BY task_ID ASC
        """;

    var tasks = new List<TaskItem>();
    await using var cmd = new SqlCommand(taskSql, conn);
    cmd.Parameters.AddWithValue("@projId", projId);

    await using var reader = await cmd.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        tasks.Add(new TaskItem
        {
            TaskId   = reader.GetString(reader.GetOrdinal("task_ID")),
            Content  = reader.GetString(reader.GetOrdinal("content")),
            Status   = reader.GetString(reader.GetOrdinal("status")),
            Priority = reader.GetString(reader.GetOrdinal("priority")),
        });
    }
    return tasks;
}
```

- [ ] **Step 3: Implement `GetBriefByProjectIdAsync` in `ProjectRepository.cs`**

Add immediately after the method above:

```csharp
// ── Get most recent brief for a project (access-checked) ──────────────
public async Task<ProjectBriefResponse?> GetBriefByProjectIdAsync(string projId, string firebaseUid)
{
    await using var conn = new SqlConnection(_connectionString);
    await conn.OpenAsync();

    // Step 1: Does the project exist?
    const string existsSql = "SELECT 1 FROM Project WHERE Proj_ID = @projId";
    await using (var existsCmd = new SqlCommand(existsSql, conn))
    {
        existsCmd.Parameters.AddWithValue("@projId", projId);
        var exists = await existsCmd.ExecuteScalarAsync();
        if (exists == null) return null; // 404 — project doesn't exist
    }

    // Step 2: Does this manager have access?
    const string accessSql = """
        SELECT 1
        FROM Manager_Project mp
        INNER JOIN [User] u ON u.user_ID = mp.manager_user_ID
        WHERE mp.project_ID = @projId
          AND u.FBUID       = @firebaseUid
        """;
    await using (var accessCmd = new SqlCommand(accessSql, conn))
    {
        accessCmd.Parameters.AddWithValue("@projId",      projId);
        accessCmd.Parameters.AddWithValue("@firebaseUid", firebaseUid);
        var hasAccess = await accessCmd.ExecuteScalarAsync();
        if (hasAccess == null)
            throw new UnauthorizedAccessException("You do not have access to this project.");
    }

    const string briefSql = """
        SELECT TOP 1 brief_ID, title, content, created_at
        FROM   Brief
        WHERE  project_ID = @projId
        ORDER  BY created_at DESC
        """;

    await using var cmd = new SqlCommand(briefSql, conn);
    cmd.Parameters.AddWithValue("@projId", projId);

    await using var reader = await cmd.ExecuteReaderAsync();
    if (!await reader.ReadAsync()) return null; // no brief found

    return new ProjectBriefResponse
    {
        BriefId   = reader.GetString(reader.GetOrdinal("brief_ID")),
        Title     = reader.GetString(reader.GetOrdinal("title")),
        Content   = reader.GetString(reader.GetOrdinal("content")),
        CreatedAt = reader.GetDateTime(reader.GetOrdinal("created_at")),
    };
}
```

- [ ] **Step 4: Build to catch any errors**

```bash
cd backend/Teamgle.Api
dotnet build
```

Expected: `Build succeeded.`

- [ ] **Step 5: Commit**

```bash
git add backend/Teamgle.Api/Repositories/IProjectRepository.cs \
        backend/Teamgle.Api/Repositories/ProjectRepository.cs
git commit -m "feat: add GetTasksByProjectIdAsync and GetBriefByProjectIdAsync to repository"
```

---

## Task 4: Add service methods

**Files:**
- Modify: `backend/Teamgle.Api/Services/IProjectService.cs`
- Modify: `backend/Teamgle.Api/Services/ProjectService.cs`

The service layer resolves the manager company to confirm they are a registered manager, then delegates to the repository. The existing `GetProjectByIdAsync` is a clean example.

Note: For tasks/brief, we return null from the repo when the project isn't found OR manager has no access (the access check SQL joins Manager_Project, so it covers both cases). The controller maps null → 404.

- [ ] **Step 1: Add method signatures to `IProjectService.cs`**

Add after `GetProjectByIdAsync`:

```csharp
    Task<IEnumerable<TaskItem>?> GetProjectTasksAsync(string firebaseUid, string projId);
    Task<ProjectBriefResponse?>  GetProjectBriefAsync(string firebaseUid, string projId);
```

- [ ] **Step 2: Implement the methods in `ProjectService.cs`**

Add after `GetProjectByIdAsync` (line 99):

```csharp
// ── Get tasks for a project ────────────────────────────────────────────
public async Task<IEnumerable<TaskItem>?> GetProjectTasksAsync(string firebaseUid, string projId)
{
    await ResolveCompanyIdAsync(firebaseUid); // confirms caller is a registered manager
    return await _projectRepo.GetTasksByProjectIdAsync(projId, firebaseUid);
}

// ── Get most recent brief for a project ───────────────────────────────
public async Task<ProjectBriefResponse?> GetProjectBriefAsync(string firebaseUid, string projId)
{
    await ResolveCompanyIdAsync(firebaseUid);
    return await _projectRepo.GetBriefByProjectIdAsync(projId, firebaseUid);
}
```

- [ ] **Step 3: Build**

```bash
cd backend/Teamgle.Api
dotnet build
```

Expected: `Build succeeded.`

- [ ] **Step 4: Commit**

```bash
git add backend/Teamgle.Api/Services/IProjectService.cs \
        backend/Teamgle.Api/Services/ProjectService.cs
git commit -m "feat: add GetProjectTasksAsync and GetProjectBriefAsync to service"
```

---

## Task 5: Add controller actions

**Files:**
- Modify: `backend/Teamgle.Api/Controllers/ProjectsController.cs`

Follow the exact pattern of `GetProject` (lines 65–89). Both actions: get UID, call service, handle null → 404, handle UnauthorizedAccessException → 403, handle Exception → 500.

- [ ] **Step 1: Add the two new actions to `ProjectsController.cs`**

Add after the closing `}` of `GetProject` (after line 89, before `// ── POST`):

```csharp
// ── GET /api/projects/{id}/tasks ──────────────────────────────────────
[HttpGet("{id}/tasks")]
public async Task<IActionResult> GetProjectTasks(string id)
{
    var uid = await GetFirebaseUidAsync();
    if (uid == null)
        return Unauthorized(new { error = "Valid Firebase token required." });

    try
    {
        var tasks = await _projectService.GetProjectTasksAsync(uid, id);
        if (tasks == null)
            return NotFound(new { error = "Project not found." });

        return Ok(tasks);
    }
    catch (UnauthorizedAccessException ex)
    {
        return StatusCode(403, new { error = ex.Message });
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error fetching tasks for project {Id}", id);
        return StatusCode(500, new { error = "An unexpected error occurred." });
    }
}

// ── GET /api/projects/{id}/brief ───────────────────────────────────────
[HttpGet("{id}/brief")]
public async Task<IActionResult> GetProjectBrief(string id)
{
    var uid = await GetFirebaseUidAsync();
    if (uid == null)
        return Unauthorized(new { error = "Valid Firebase token required." });

    try
    {
        var brief = await _projectService.GetProjectBriefAsync(uid, id);
        if (brief == null)
            return NotFound(new { error = "No brief found for this project." });

        return Ok(brief);
    }
    catch (UnauthorizedAccessException ex)
    {
        return StatusCode(403, new { error = ex.Message });
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error fetching brief for project {Id}", id);
        return StatusCode(500, new { error = "An unexpected error occurred." });
    }
}
```

- [ ] **Step 2: Build**

```bash
cd backend/Teamgle.Api
dotnet build
```

Expected: `Build succeeded.`

- [ ] **Step 3: Smoke test the endpoints manually**

Start the backend: `dotnet run` (listens on `http://localhost:5000`).

In a browser or curl, with a valid Firebase Bearer token:
- `GET http://localhost:5000/api/projects/{a-real-proj-id}/tasks` → expect `200 []` or `200 [{...}]`
- `GET http://localhost:5000/api/projects/{a-real-proj-id}/brief` → expect `200 {...}` or `404`
- `GET http://localhost:5000/api/projects/nonexistent/tasks` → expect `404`

- [ ] **Step 4: Commit**

```bash
git add backend/Teamgle.Api/Controllers/ProjectsController.cs
git commit -m "feat: add GET /api/projects/{id}/tasks and /brief endpoints"
```

---

## Task 6: Frontend — state flags and tab hook

**Files:**
- Modify: `frontend/js/manager-dashboard.js`

Context: The project detail state block starts at line 1368. `currentProjectDetail` and `_pdCalendar` are declared at lines 1370–1371. `openProjectDetail()` is at line 1392. `activateProjectTab()` is at line 1382.

- [ ] **Step 1: Add the two cache flags after `_pdCalendar` (line 1371)**

Find this block in `manager-dashboard.js`:
```js
let currentProjectDetail = null; // holds last fetched ProjectDetailResponse
let _pdCalendar          = null; // FullCalendar instance
```

Add two lines immediately after:
```js
let _pdTasksLoaded       = false; // true after Tasks tab first loaded for this project
let _pdBriefLoaded       = false; // true after Brief tab first loaded for this project
```

- [ ] **Step 2: Reset the flags at the top of `openProjectDetail()`**

Find in `openProjectDetail()`:
```js
async function openProjectDetail(projId) {
  // Reset to dashboard tab and show the section
  currentProjectDetail = null;
  activateProjectTab('dashboard');
```

Add two lines after `currentProjectDetail = null;`:
```js
  _pdTasksLoaded = false;
  _pdBriefLoaded = false;
```

- [ ] **Step 3: Hook the new render functions into `activateProjectTab()`**

Find:
```js
  if (name === 'schedule') renderScheduleCalendar();
```

Add immediately after that line:
```js
  if (name === 'tasks')    renderTasksTab();
  if (name === 'brief')    renderBriefTab();
```

- [ ] **Step 4: Commit**

```bash
git add frontend/js/manager-dashboard.js
git commit -m "feat: add _pdTasksLoaded/_pdBriefLoaded flags and tab hooks"
```

---

## Task 7: Frontend — `renderTasksTab()` and `renderBriefTab()`

**Files:**
- Modify: `frontend/js/manager-dashboard.js`

Add both functions after `renderScheduleCalendar()` (which ends around line 1472). The `API_BASE` constant and `getToken()` function are already defined earlier in the file.

- [ ] **Step 1: Add `renderTasksTab()` after `renderScheduleCalendar()`**

Add this function after the closing `}` of `renderScheduleCalendar()`:

```js
// ── TASKS TAB ──────────────────────────────────────────────────────────────

async function renderTasksTab() {
  if (_pdTasksLoaded) return; // already rendered for this project
  _pdTasksLoaded = true;

  const panel = document.querySelector('.pd-panel[data-tab-panel="tasks"]');
  if (!panel) return;

  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/projects/${encodeURIComponent(currentProjectDetail.projId)}/tasks`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tasks = await res.json();

    if (tasks.length === 0) {
      panel.innerHTML = '<div class="pd-placeholder">No tasks found for this project.</div>';
      return;
    }

    const rows = tasks.map(t => `
      <div class="pd-task-row">
        <span class="pd-task-content">${escapeHtml(t.content)}</span>
        <span class="pd-badges">
          <span class="pd-badge pd-badge--status">${escapeHtml(t.status)}</span>
          <span class="pd-badge pd-badge--priority">${escapeHtml(t.priority)}</span>
        </span>
      </div>
    `).join('');

    panel.innerHTML = `<div class="pd-task-list">${rows}</div>`;
  } catch {
    panel.innerHTML = '<div class="pd-placeholder">Failed to load — please try again.</div>';
  }
}
```

- [ ] **Step 2: Add `renderBriefTab()` immediately after**

```js
// ── BRIEF TAB ──────────────────────────────────────────────────────────────

async function renderBriefTab() {
  if (_pdBriefLoaded) return;
  _pdBriefLoaded = true;

  const panel = document.querySelector('.pd-panel[data-tab-panel="brief"]');
  if (!panel) return;

  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/projects/${encodeURIComponent(currentProjectDetail.projId)}/brief`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (res.status === 404) {
      panel.innerHTML = '<div class="pd-placeholder">No brief available for this project.</div>';
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const brief = await res.json();
    const date  = brief.createdAt
      ? new Date(brief.createdAt).toLocaleDateString('he-IL')
      : '';

    panel.innerHTML = `
      <div class="pd-brief-body">
        <h3 class="pd-brief-title">${escapeHtml(brief.title)}</h3>
        <p  class="pd-brief-content">${escapeHtml(brief.content)}</p>
        ${date ? `<div class="pd-brief-meta">${escapeHtml(date)}</div>` : ''}
      </div>
    `;
  } catch {
    panel.innerHTML = '<div class="pd-placeholder">Failed to load — please try again.</div>';
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/js/manager-dashboard.js
git commit -m "feat: add renderTasksTab and renderBriefTab functions"
```

---

## Task 8: Frontend — CSS styles

**Files:**
- Modify: `frontend/css/manager-dashboard.css`

Add at the end of the `/* ── Schedule / Gantt Tab ── */` block (after line 2219), before the responsive overrides section.

- [ ] **Step 1: Add styles for Tasks and Brief tabs**

```css
/* ── Tasks Tab ───────────────────────────────────────────────────────────── */

.pd-task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0;
}

.pd-task-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.pd-task-content {
  flex: 1;
  font-size: 14px;
  color: var(--text);
  line-height: 1.4;
}

.pd-badges {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.pd-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.pd-badge--status   { background: var(--blue-light); color: var(--blue); }
.pd-badge--priority { background: #f0f0f0;           color: var(--text-muted); }

/* ── Brief Tab ───────────────────────────────────────────────────────────── */

.pd-brief-body {
  max-width: 720px;
  padding: 8px 0;
}

.pd-brief-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 14px;
}

.pd-brief-content {
  font-size: 14px;
  color: var(--text);
  line-height: 1.7;
  white-space: pre-wrap;
  margin: 0 0 12px;
}

.pd-brief-meta {
  font-size: 12px;
  color: var(--text-muted);
}
```

- [ ] **Step 2: Check that CSS variables are consistent**

The styles above use `var(--border)`, `var(--radius)`, `var(--text)`, `var(--text-muted)`, `var(--blue)`, `var(--blue-light)`. These are all defined in the existing CSS file. Grep to confirm:

```bash
grep -n "\-\-blue\b\|\-\-border\b\|\-\-radius\b\|\-\-text\b" frontend/css/manager-dashboard.css | head -20
```

Expected: lines showing variable definitions near the top of the file.

- [ ] **Step 3: Commit**

```bash
git add frontend/css/manager-dashboard.css
git commit -m "feat: add CSS for pd-task-list, pd-task-row, pd-badge, pd-brief-body"
```

---

## Task 9: Frontend — clean up HTML placeholders

**Files:**
- Modify: `frontend/manager-dashboard.html`

The tasks and brief panels currently have placeholder content (the icon + "coming soon" text, lines 360–370). Since `renderTasksTab()` and `renderBriefTab()` overwrite `panel.innerHTML` entirely, these placeholders would flash briefly. Replace them with empty panels so there's no flicker.

- [ ] **Step 1: Clear the tasks panel content**

Find in `manager-dashboard.html`:
```html
        <div class="pd-panel" data-tab-panel="tasks" style="display:none">
          <div class="pd-placeholder">
            <span class="material-symbols-outlined" style="font-size:40px;margin-bottom:8px">task_alt</span>
            Tasks — coming soon
          </div>
        </div>
```

Replace with:
```html
        <div class="pd-panel" data-tab-panel="tasks" style="display:none"></div>
```

- [ ] **Step 2: Clear the brief panel content**

Find:
```html
        <div class="pd-panel" data-tab-panel="brief" style="display:none">
          <div class="pd-placeholder">
            <span class="material-symbols-outlined" style="font-size:40px;margin-bottom:8px">description</span>
            Brief — coming soon
          </div>
        </div>
```

Replace with:
```html
        <div class="pd-panel" data-tab-panel="brief" style="display:none"></div>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/manager-dashboard.html
git commit -m "feat: remove coming-soon placeholders from tasks and brief panels"
```

---

## Task 10: Validate with Playwright

**Files:**
- (read-only validation; no code changes expected)

Prerequisites: backend running on `http://localhost:5000`, frontend served by VS Code Live Server on `http://127.0.0.1:5500`. At least one project must exist in the database. Optionally seed a task and brief row pointing to that project.

- [ ] **Step 1: Open the app and log in**

Use Playwright to navigate to `http://127.0.0.1:5500/auth.html` and sign in as a manager. Verify redirect to `manager-dashboard.html`.

- [ ] **Step 2: Open a project detail**

Navigate to the Projects section. Double-click a project kanban card. Verify the project detail view opens (title appears, no "Error loading project").

- [ ] **Step 3: Click Tasks tab — verify data renders**

Click the "Tasks" tab. Verify:
- No console errors
- If tasks exist: `.pd-task-row` elements are present, each with `.pd-task-content`, `.pd-badge--status`, `.pd-badge--priority`
- If no tasks: `.pd-placeholder` with "No tasks found for this project." is shown

- [ ] **Step 4: Click Tasks tab again — verify no duplicate fetch**

Click "Tasks" again. Open DevTools → Network. Verify no new request to `/api/projects/.../tasks` fires (cache check).

- [ ] **Step 5: Click Brief tab — verify data renders**

Click the "Brief" tab. Verify:
- No console errors
- If brief exists: `.pd-brief-title`, `.pd-brief-content`, optionally `.pd-brief-meta` are rendered
- If no brief: `.pd-placeholder` with "No brief available for this project." is shown

- [ ] **Step 6: Click Brief tab again — verify no duplicate fetch**

Same cache check as step 4.

- [ ] **Step 7: Verify other tabs are unbroken**

Click Dashboard, Employees, Schedule/Gantt, Finance tabs. Verify they render their existing content (placeholders or calendar) without errors.

- [ ] **Step 8: Inspect layout with Playwright screenshot**

Take a screenshot of the Tasks tab and Brief tab. Verify badges align on the right, task content is readable, brief title/content/date display correctly, no overflow.

- [ ] **Step 9: If layout issues found — fix CSS and re-validate**

If a visual issue is found in step 8, adjust `.pd-task-row`, `.pd-badge`, or `.pd-brief-body` styles in `manager-dashboard.css` and repeat steps 3–8.

- [ ] **Step 10: Final commit if any fixes were made**

```bash
git add frontend/css/manager-dashboard.css
git commit -m "fix: adjust task/brief panel layout after visual validation"
```

---

## Final: push branch

- [ ] **Step 1: Confirm all tasks completed and branch is clean**

```bash
git status
git log --oneline feature/project-tasks-brief ^master
```

Expected: 0 uncommitted changes, commit history shows all feature commits.

- [ ] **Step 2: Create PR (optional)**

```bash
gh pr create \
  --base master \
  --head feature/project-tasks-brief \
  --title "feat: implement Tasks and Brief tabs in project detail" \
  --body "Implements GET /api/projects/{id}/tasks and /brief endpoints and replaces coming-soon placeholders with live data. Spec: docs/superpowers/specs/2026-03-23-project-tasks-brief-design.md"
```
