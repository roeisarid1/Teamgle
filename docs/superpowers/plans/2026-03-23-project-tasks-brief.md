# Project Tasks & Brief — Full CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Tasks" and "Brief" coming-soon placeholders in the project detail page with fully functional inline CRUD management — list, create, edit, delete — backed by two new sets of API endpoints.

**Architecture:** 8 new REST endpoints follow the existing Controller → Service → Repository pattern. The frontend renders Task and Brief rows as expandable cards (inline, no modals), using a `max-height` CSS animation. State is cached per project session; project switching resets all state and DOM. All IDs and server-side fields are set server-side.

**Tech Stack:** ASP.NET Core 8 / ADO.NET / SQL Server (backend); Vanilla JS + HTML/CSS — no new libraries (frontend); Playwright (end-to-end validation).

**Spec:** `docs/superpowers/specs/2026-03-23-project-tasks-brief-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `backend/Teamgle.Api/Models/DTOs/TaskItem.cs` | Task read response DTO |
| Create | `backend/Teamgle.Api/Models/DTOs/CreateTaskRequest.cs` | Task create/update request DTO |
| Create | `backend/Teamgle.Api/Models/DTOs/UpdateTaskRequest.cs` | Task update request DTO |
| Create | `backend/Teamgle.Api/Models/DTOs/BriefItem.cs` | Brief read response DTO |
| Create | `backend/Teamgle.Api/Models/DTOs/CreateBriefRequest.cs` | Brief create request DTO |
| Create | `backend/Teamgle.Api/Models/DTOs/UpdateBriefRequest.cs` | Brief update request DTO |
| Modify | `backend/Teamgle.Api/Repositories/IProjectRepository.cs` | Add 8 new method signatures |
| Modify | `backend/Teamgle.Api/Repositories/ProjectRepository.cs` | Implement 8 new repository methods |
| Modify | `backend/Teamgle.Api/Services/IProjectService.cs` | Add 8 new service method signatures |
| Modify | `backend/Teamgle.Api/Services/ProjectService.cs` | Implement 8 pass-through service methods |
| Modify | `backend/Teamgle.Api/Controllers/ProjectsController.cs` | Add 8 new action methods |
| Modify | `frontend/manager-dashboard.html` | Replace tasks/brief placeholders with empty list containers |
| Modify | `frontend/css/manager-dashboard.css` | Add task/brief card, badge, animation, responsive styles |
| Modify | `frontend/js/manager-dashboard.js` | State vars, reset logic, tab hooks, render+CRUD functions |

---

## Task 1: Create Git Branch

**Files:** (git only)

- [ ] **Step 1: Create and switch to the feature branch**

```bash
cd c:/Users/roies/Desktop/Teamgle_App
git checkout -b feature/project-task-brief-management
```

Expected: `Switched to a new branch 'feature/project-task-brief-management'`

---

## Task 2: Create Backend DTOs

**Files:**
- Create: `backend/Teamgle.Api/Models/DTOs/TaskItem.cs`
- Create: `backend/Teamgle.Api/Models/DTOs/CreateTaskRequest.cs`
- Create: `backend/Teamgle.Api/Models/DTOs/UpdateTaskRequest.cs`
- Create: `backend/Teamgle.Api/Models/DTOs/BriefItem.cs`
- Create: `backend/Teamgle.Api/Models/DTOs/CreateBriefRequest.cs`
- Create: `backend/Teamgle.Api/Models/DTOs/UpdateBriefRequest.cs`

- [ ] **Step 1: Create `TaskItem.cs`**

```csharp
// backend/Teamgle.Api/Models/DTOs/TaskItem.cs
namespace Teamgle.Api.Models.DTOs;

public class TaskItem
{
    public string TaskId   { get; set; } = string.Empty;
    public string Content  { get; set; } = string.Empty;
    public string Status   { get; set; } = string.Empty;  // open | in_progress | done | canceled
    public string Priority { get; set; } = string.Empty;  // low | medium | high | urgent
}
```

- [ ] **Step 2: Create `CreateTaskRequest.cs`**

```csharp
// backend/Teamgle.Api/Models/DTOs/CreateTaskRequest.cs
namespace Teamgle.Api.Models.DTOs;

public class CreateTaskRequest
{
    public string Content  { get; set; } = string.Empty;
    public string Status   { get; set; } = string.Empty;
    public string Priority { get; set; } = string.Empty;
}
```

- [ ] **Step 3: Create `UpdateTaskRequest.cs`**

```csharp
// backend/Teamgle.Api/Models/DTOs/UpdateTaskRequest.cs
namespace Teamgle.Api.Models.DTOs;

public class UpdateTaskRequest
{
    public string Content  { get; set; } = string.Empty;
    public string Status   { get; set; } = string.Empty;
    public string Priority { get; set; } = string.Empty;
}
```

- [ ] **Step 4: Create `BriefItem.cs`**

Note: `CreatedAt` is `DateTime?` because the DB column is nullable. `CreatedByManagerName` is `string?` because the FK may be null or the user row may be deleted.

```csharp
// backend/Teamgle.Api/Models/DTOs/BriefItem.cs
namespace Teamgle.Api.Models.DTOs;

public class BriefItem
{
    public string    BriefId              { get; set; } = string.Empty;
    public string    Title                { get; set; } = string.Empty;
    public string    Content              { get; set; } = string.Empty;
    public DateTime? CreatedAt            { get; set; }
    public string    CreatedByManagerId   { get; set; } = string.Empty;
    public string?   CreatedByManagerName { get; set; }  // null → render "Unknown" in frontend
}
```

- [ ] **Step 5: Create `CreateBriefRequest.cs`**

```csharp
// backend/Teamgle.Api/Models/DTOs/CreateBriefRequest.cs
namespace Teamgle.Api.Models.DTOs;

public class CreateBriefRequest
{
    public string Title   { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
}
```

- [ ] **Step 6: Create `UpdateBriefRequest.cs`**

```csharp
// backend/Teamgle.Api/Models/DTOs/UpdateBriefRequest.cs
namespace Teamgle.Api.Models.DTOs;

public class UpdateBriefRequest
{
    public string Title   { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
}
```

- [ ] **Step 7: Build to verify no errors**

```bash
cd backend/Teamgle.Api && dotnet build
```

Expected: `Build succeeded.` with 0 errors.

---

## Task 3: Repository — Tasks CRUD

**Files:**
- Modify: `backend/Teamgle.Api/Repositories/IProjectRepository.cs`
- Modify: `backend/Teamgle.Api/Repositories/ProjectRepository.cs`

**Shared helper context:** Every repository method uses a two-step access check — first verify the project exists (→ return null/false if not), then verify the manager has access via `Manager_Project` (→ throw `UnauthorizedAccessException` if not). This maps to 404 and 403 respectively in the controller.

The repository uses `Guid.NewGuid().ToString()` for generated IDs (not `NEWID()`), consistent with the existing pattern in `CreateShiftAsync` and others.

- [ ] **Step 1: Add Task method signatures to `IProjectRepository.cs`**

Open `backend/Teamgle.Api/Repositories/IProjectRepository.cs`. After the `// ── Query ──` section (line 22), add:

```csharp
    // ── Tasks ──────────────────────────────────────────────────────────────
    Task<IEnumerable<TaskItem>?> GetTasksByProjectIdAsync(string projId, string firebaseUid);
    Task<TaskItem?> CreateTaskAsync(string projId, CreateTaskRequest request, string firebaseUid);
    Task<TaskItem?> UpdateTaskAsync(string taskId, string projId, UpdateTaskRequest request, string firebaseUid);
    Task<bool?> DeleteTaskAsync(string taskId, string projId, string firebaseUid);
```

Return type semantics:
- `IEnumerable<TaskItem>?` — null = project not found; empty = project found, no tasks
- `TaskItem?` — null = project or task not found
- `bool?` — null = project not found; false = task not found in this project; true = deleted

- [ ] **Step 2: Add Task methods to `ProjectRepository.cs`**

Add after the closing `}` of `GetProjectDetailAsync` (before the `CreateShiftAsync` method, or at end of class before the final `}`). Add these four methods:

```csharp
// ── Shared: two-step access check ─────────────────────────────────────
// Returns true if access OK, null if project not found, throws UnauthorizedAccessException if forbidden.
private async Task<bool?> CheckProjectAccessAsync(SqlConnection conn, string projId, string firebaseUid)
{
    const string existsSql = "SELECT 1 FROM Project WHERE Proj_ID = @projId";
    await using (var cmd = new SqlCommand(existsSql, conn))
    {
        cmd.Parameters.AddWithValue("@projId", projId);
        if (await cmd.ExecuteScalarAsync() == null) return null; // project not found
    }

    const string accessSql = """
        SELECT 1
        FROM   Manager_Project mp
        INNER JOIN [User] u ON u.user_ID = mp.manager_user_ID
        WHERE  mp.project_ID = @projId
          AND  u.FBUID       = @fbUid
        """;
    await using (var cmd = new SqlCommand(accessSql, conn))
    {
        cmd.Parameters.AddWithValue("@projId", projId);
        cmd.Parameters.AddWithValue("@fbUid",  firebaseUid);
        if (await cmd.ExecuteScalarAsync() == null)
            throw new UnauthorizedAccessException("You do not have access to this project.");
    }
    return true;
}

// ── GET tasks for a project ────────────────────────────────────────────
public async Task<IEnumerable<TaskItem>?> GetTasksByProjectIdAsync(string projId, string firebaseUid)
{
    await using var conn = new SqlConnection(_connectionString);
    await conn.OpenAsync();

    if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null) return null;

    const string sql = """
        SELECT task_ID, content, status, priority
        FROM   Task
        WHERE  project_ID = @projId
        ORDER  BY task_ID ASC
        """;

    var tasks = new List<TaskItem>();
    await using var cmd    = new SqlCommand(sql, conn);
    cmd.Parameters.AddWithValue("@projId", projId);
    await using var reader = await cmd.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        tasks.Add(new TaskItem
        {
            TaskId   = reader.GetString(reader.GetOrdinal("task_ID")),
            Content  = reader.IsDBNull(reader.GetOrdinal("content"))  ? string.Empty : reader.GetString(reader.GetOrdinal("content")),
            Status   = reader.GetString(reader.GetOrdinal("status")),
            Priority = reader.GetString(reader.GetOrdinal("priority")),
        });
    }
    return tasks;
}

// ── CREATE task ────────────────────────────────────────────────────────
public async Task<TaskItem?> CreateTaskAsync(string projId, CreateTaskRequest request, string firebaseUid)
{
    await using var conn = new SqlConnection(_connectionString);
    await conn.OpenAsync();

    if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null) return null;

    var newId = Guid.NewGuid().ToString();
    const string sql = """
        INSERT INTO Task (task_ID, content, status, priority, project_ID, event_ID, shift_ID)
        VALUES (@taskId, @content, @status, @priority, @projId, NULL, NULL)
        """;

    await using var cmd = new SqlCommand(sql, conn);
    cmd.Parameters.AddWithValue("@taskId",   newId);
    cmd.Parameters.AddWithValue("@content",  request.Content);
    cmd.Parameters.AddWithValue("@status",   request.Status);
    cmd.Parameters.AddWithValue("@priority", request.Priority);
    cmd.Parameters.AddWithValue("@projId",   projId);
    await cmd.ExecuteNonQueryAsync();

    return new TaskItem
    {
        TaskId   = newId,
        Content  = request.Content,
        Status   = request.Status,
        Priority = request.Priority,
    };
}

// ── UPDATE task ────────────────────────────────────────────────────────
public async Task<TaskItem?> UpdateTaskAsync(string taskId, string projId, UpdateTaskRequest request, string firebaseUid)
{
    await using var conn = new SqlConnection(_connectionString);
    await conn.OpenAsync();

    if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null) return null;

    const string sql = """
        UPDATE Task
        SET    content  = @content,
               status   = @status,
               priority = @priority
        WHERE  task_ID    = @taskId
          AND  project_ID = @projId
        """;

    await using var cmd = new SqlCommand(sql, conn);
    cmd.Parameters.AddWithValue("@content",  request.Content);
    cmd.Parameters.AddWithValue("@status",   request.Status);
    cmd.Parameters.AddWithValue("@priority", request.Priority);
    cmd.Parameters.AddWithValue("@taskId",   taskId);
    cmd.Parameters.AddWithValue("@projId",   projId);
    var rows = await cmd.ExecuteNonQueryAsync();
    if (rows == 0) return null; // task not found in this project

    return new TaskItem
    {
        TaskId   = taskId,
        Content  = request.Content,
        Status   = request.Status,
        Priority = request.Priority,
    };
}

// ── DELETE task ────────────────────────────────────────────────────────
public async Task<bool?> DeleteTaskAsync(string taskId, string projId, string firebaseUid)
{
    await using var conn = new SqlConnection(_connectionString);
    await conn.OpenAsync();

    if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null) return null;

    const string sql = "DELETE FROM Task WHERE task_ID = @taskId AND project_ID = @projId";
    await using var cmd = new SqlCommand(sql, conn);
    cmd.Parameters.AddWithValue("@taskId", taskId);
    cmd.Parameters.AddWithValue("@projId", projId);
    return await cmd.ExecuteNonQueryAsync() > 0;
}
```

- [ ] **Step 3: Build**

```bash
cd backend/Teamgle.Api && dotnet build
```

Expected: `Build succeeded.` with 0 errors.

---

## Task 4: Repository — Briefs CRUD

**Files:**
- Modify: `backend/Teamgle.Api/Repositories/IProjectRepository.cs`
- Modify: `backend/Teamgle.Api/Repositories/ProjectRepository.cs`

- [ ] **Step 1: Add Brief method signatures to `IProjectRepository.cs`**

After the Task signatures added in Task 3, add:

```csharp
    // ── Briefs ─────────────────────────────────────────────────────────────
    Task<IEnumerable<BriefItem>?> GetBriefsByProjectIdAsync(string projId, string firebaseUid);
    Task<BriefItem?> CreateBriefAsync(string projId, CreateBriefRequest request, string firebaseUid);
    Task<BriefItem?> UpdateBriefAsync(string briefId, string projId, UpdateBriefRequest request, string firebaseUid);
    Task<bool?> DeleteBriefAsync(string briefId, string projId, string firebaseUid);
```

- [ ] **Step 2: Add Brief methods to `ProjectRepository.cs`**

Add after the Task methods:

```csharp
// ── Helper: read BriefItem from open SqlDataReader ─────────────────────
private static BriefItem ReadBriefItem(SqlDataReader r) => new()
{
    BriefId              = r.GetString(r.GetOrdinal("brief_ID")),
    Title                = r.IsDBNull(r.GetOrdinal("title"))        ? string.Empty : r.GetString(r.GetOrdinal("title")),
    Content              = r.IsDBNull(r.GetOrdinal("content"))      ? string.Empty : r.GetString(r.GetOrdinal("content")),
    CreatedAt            = r.IsDBNull(r.GetOrdinal("created_at"))   ? (DateTime?)null : r.GetDateTime(r.GetOrdinal("created_at")),
    CreatedByManagerId   = r.IsDBNull(r.GetOrdinal("created_by_manager_user_ID")) ? string.Empty : r.GetString(r.GetOrdinal("created_by_manager_user_ID")),
    CreatedByManagerName = r.IsDBNull(r.GetOrdinal("manager_name")) ? null : r.GetString(r.GetOrdinal("manager_name")),
};

private const string BriefSelectSql = """
    SELECT b.brief_ID, b.title, b.content, b.created_at,
           b.created_by_manager_user_ID,
           u.firstName + ' ' + u.lastName AS manager_name
    FROM   Brief b
    LEFT JOIN [User] u ON u.user_ID = b.created_by_manager_user_ID
    """;

// ── GET briefs for a project ───────────────────────────────────────────
public async Task<IEnumerable<BriefItem>?> GetBriefsByProjectIdAsync(string projId, string firebaseUid)
{
    await using var conn = new SqlConnection(_connectionString);
    await conn.OpenAsync();

    if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null) return null;

    var sql = BriefSelectSql + " WHERE b.project_ID = @projId ORDER BY b.created_at DESC";
    var briefs = new List<BriefItem>();
    await using var cmd    = new SqlCommand(sql, conn);
    cmd.Parameters.AddWithValue("@projId", projId);
    await using var reader = await cmd.ExecuteReaderAsync();
    while (await reader.ReadAsync()) briefs.Add(ReadBriefItem(reader));
    return briefs;
}

// ── CREATE brief ───────────────────────────────────────────────────────
public async Task<BriefItem?> CreateBriefAsync(string projId, CreateBriefRequest request, string firebaseUid)
{
    await using var conn = new SqlConnection(_connectionString);
    await conn.OpenAsync();

    if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null) return null;

    // Resolve manager user_ID from Firebase UID
    string? managerUserId;
    await using (var resolveCmd = new SqlCommand("SELECT user_ID FROM [User] WHERE FBUID = @fbUid", conn))
    {
        resolveCmd.Parameters.AddWithValue("@fbUid", firebaseUid);
        managerUserId = (string?)await resolveCmd.ExecuteScalarAsync();
    }

    var newId    = Guid.NewGuid().ToString();
    var now      = DateTime.UtcNow;
    const string insertSql = """
        INSERT INTO Brief (brief_ID, title, content, created_at, created_by_manager_user_ID, project_ID, event_ID, shift_ID)
        VALUES (@briefId, @title, @content, @createdAt, @managerId, @projId, NULL, NULL)
        """;

    await using var cmd = new SqlCommand(insertSql, conn);
    cmd.Parameters.AddWithValue("@briefId",   newId);
    cmd.Parameters.AddWithValue("@title",     request.Title);
    cmd.Parameters.AddWithValue("@content",   request.Content);
    cmd.Parameters.AddWithValue("@createdAt", now);
    cmd.Parameters.AddWithValue("@managerId", (object?)managerUserId ?? DBNull.Value);
    cmd.Parameters.AddWithValue("@projId",    projId);
    await cmd.ExecuteNonQueryAsync();

    // Fetch back with manager name join for consistent response
    var selectSql = BriefSelectSql + " WHERE b.brief_ID = @briefId";
    await using var selCmd    = new SqlCommand(selectSql, conn);
    selCmd.Parameters.AddWithValue("@briefId", newId);
    await using var reader = await selCmd.ExecuteReaderAsync();
    await reader.ReadAsync();
    return ReadBriefItem(reader);
}

// ── UPDATE brief ───────────────────────────────────────────────────────
public async Task<BriefItem?> UpdateBriefAsync(string briefId, string projId, UpdateBriefRequest request, string firebaseUid)
{
    await using var conn = new SqlConnection(_connectionString);
    await conn.OpenAsync();

    if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null) return null;

    const string updateSql = """
        UPDATE Brief
        SET    title   = @title,
               content = @content
        WHERE  brief_ID   = @briefId
          AND  project_ID = @projId
        """;

    await using var cmd = new SqlCommand(updateSql, conn);
    cmd.Parameters.AddWithValue("@title",   request.Title);
    cmd.Parameters.AddWithValue("@content", request.Content);
    cmd.Parameters.AddWithValue("@briefId", briefId);
    cmd.Parameters.AddWithValue("@projId",  projId);
    var rows = await cmd.ExecuteNonQueryAsync();
    if (rows == 0) return null;

    // Fetch back updated row with manager name
    var selectSql = BriefSelectSql + " WHERE b.brief_ID = @briefId";
    await using var selCmd = new SqlCommand(selectSql, conn);
    selCmd.Parameters.AddWithValue("@briefId", briefId);
    await using var reader = await selCmd.ExecuteReaderAsync();
    await reader.ReadAsync();
    return ReadBriefItem(reader);
}

// ── DELETE brief ───────────────────────────────────────────────────────
public async Task<bool?> DeleteBriefAsync(string briefId, string projId, string firebaseUid)
{
    await using var conn = new SqlConnection(_connectionString);
    await conn.OpenAsync();

    if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null) return null;

    const string sql = "DELETE FROM Brief WHERE brief_ID = @briefId AND project_ID = @projId";
    await using var cmd = new SqlCommand(sql, conn);
    cmd.Parameters.AddWithValue("@briefId", briefId);
    cmd.Parameters.AddWithValue("@projId",  projId);
    return await cmd.ExecuteNonQueryAsync() > 0;
}
```

- [ ] **Step 3: Build**

```bash
cd backend/Teamgle.Api && dotnet build
```

Expected: `Build succeeded.`

---

## Task 5: Service Layer — Tasks & Briefs

**Files:**
- Modify: `backend/Teamgle.Api/Services/IProjectService.cs`
- Modify: `backend/Teamgle.Api/Services/ProjectService.cs`

The service layer validates inputs (400 logic), confirms the caller is a registered manager via `ResolveCompanyIdAsync`, then delegates to the repository.

- [ ] **Step 1: Add signatures to `IProjectService.cs`**

After `GetProjectByIdAsync`, add:

```csharp
    // ── Tasks ──────────────────────────────────────────────────────────────
    Task<IEnumerable<TaskItem>?> GetProjectTasksAsync(string firebaseUid, string projId);
    Task<TaskItem?> CreateProjectTaskAsync(string firebaseUid, string projId, CreateTaskRequest request);
    Task<TaskItem?> UpdateProjectTaskAsync(string firebaseUid, string projId, string taskId, UpdateTaskRequest request);
    Task<bool?> DeleteProjectTaskAsync(string firebaseUid, string projId, string taskId);

    // ── Briefs ─────────────────────────────────────────────────────────────
    Task<IEnumerable<BriefItem>?> GetProjectBriefsAsync(string firebaseUid, string projId);
    Task<BriefItem?> CreateProjectBriefAsync(string firebaseUid, string projId, CreateBriefRequest request);
    Task<BriefItem?> UpdateProjectBriefAsync(string firebaseUid, string projId, string briefId, UpdateBriefRequest request);
    Task<bool?> DeleteProjectBriefAsync(string firebaseUid, string projId, string briefId);
```

- [ ] **Step 2: Add validation constants + Task methods to `ProjectService.cs`**

Add these private constants at the top of the class body (after the `_projectRepo` field):

```csharp
    private static readonly HashSet<string> ValidTaskStatuses   = ["open", "in_progress", "done", "canceled"];
    private static readonly HashSet<string> ValidTaskPriorities = ["low", "medium", "high", "urgent"];

    private static void ValidateTaskFields(string content, string status, string priority)
    {
        if (string.IsNullOrWhiteSpace(content))
            throw new ArgumentException("Task content is required.");
        if (!ValidTaskStatuses.Contains(status))
            throw new ArgumentException($"Invalid status '{status}'. Allowed: open, in_progress, done, canceled.");
        if (!ValidTaskPriorities.Contains(priority))
            throw new ArgumentException($"Invalid priority '{priority}'. Allowed: low, medium, high, urgent.");
    }
```

Then add the Task service methods after `GetProjectByIdAsync`:

```csharp
    // ── Tasks ──────────────────────────────────────────────────────────────
    public async Task<IEnumerable<TaskItem>?> GetProjectTasksAsync(string firebaseUid, string projId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.GetTasksByProjectIdAsync(projId, firebaseUid);
    }

    public async Task<TaskItem?> CreateProjectTaskAsync(string firebaseUid, string projId, CreateTaskRequest request)
    {
        ValidateTaskFields(request.Content, request.Status, request.Priority);
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.CreateTaskAsync(projId, request, firebaseUid);
    }

    public async Task<TaskItem?> UpdateProjectTaskAsync(string firebaseUid, string projId, string taskId, UpdateTaskRequest request)
    {
        ValidateTaskFields(request.Content, request.Status, request.Priority);
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.UpdateTaskAsync(taskId, projId, request, firebaseUid);
    }

    public async Task<bool?> DeleteProjectTaskAsync(string firebaseUid, string projId, string taskId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.DeleteTaskAsync(taskId, projId, firebaseUid);
    }
```

- [ ] **Step 3: Add Brief service methods to `ProjectService.cs`**

After the Task methods:

```csharp
    // ── Briefs ─────────────────────────────────────────────────────────────
    public async Task<IEnumerable<BriefItem>?> GetProjectBriefsAsync(string firebaseUid, string projId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.GetBriefsByProjectIdAsync(projId, firebaseUid);
    }

    public async Task<BriefItem?> CreateProjectBriefAsync(string firebaseUid, string projId, CreateBriefRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
            throw new ArgumentException("Brief title is required.");
        if (string.IsNullOrWhiteSpace(request.Content))
            throw new ArgumentException("Brief content is required.");
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.CreateBriefAsync(projId, request, firebaseUid);
    }

    public async Task<BriefItem?> UpdateProjectBriefAsync(string firebaseUid, string projId, string briefId, UpdateBriefRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
            throw new ArgumentException("Brief title is required.");
        if (string.IsNullOrWhiteSpace(request.Content))
            throw new ArgumentException("Brief content is required.");
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.UpdateBriefAsync(briefId, projId, request, firebaseUid);
    }

    public async Task<bool?> DeleteProjectBriefAsync(string firebaseUid, string projId, string briefId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.DeleteBriefAsync(briefId, projId, firebaseUid);
    }
```

- [ ] **Step 4: Build**

```bash
cd backend/Teamgle.Api && dotnet build
```

Expected: `Build succeeded.`

---

## Task 6: Controller — Tasks & Briefs Endpoints

**Files:**
- Modify: `backend/Teamgle.Api/Controllers/ProjectsController.cs`

Follow the exact pattern of existing actions: get UID → call service → map null to 404 → catch `UnauthorizedAccessException` → 403 → catch `ArgumentException` → 400 → catch `Exception` → 500.

- [ ] **Step 1: Add Task endpoints to `ProjectsController.cs`**

Add after the closing `}` of `CreateProject` (line 117, before the final `}`):

```csharp
    // ── GET /api/projects/{id}/tasks ──────────────────────────────────────
    [HttpGet("{id}/tasks")]
    public async Task<IActionResult> GetProjectTasks(string id)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var tasks = await _projectService.GetProjectTasksAsync(uid, id);
            if (tasks == null) return NotFound(new { error = "Project not found." });
            return Ok(tasks);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching tasks for project {Id}", id);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── POST /api/projects/{id}/tasks ─────────────────────────────────────
    [HttpPost("{id}/tasks")]
    public async Task<IActionResult> CreateProjectTask(string id, [FromBody] CreateTaskRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var task = await _projectService.CreateProjectTaskAsync(uid, id, request);
            if (task == null) return NotFound(new { error = "Project not found." });
            return StatusCode(201, task);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating task for project {Id}", id);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── PUT /api/projects/{id}/tasks/{taskId} ─────────────────────────────
    [HttpPut("{id}/tasks/{taskId}")]
    public async Task<IActionResult> UpdateProjectTask(string id, string taskId, [FromBody] UpdateTaskRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var task = await _projectService.UpdateProjectTaskAsync(uid, id, taskId, request);
            if (task == null) return NotFound(new { error = "Task not found." });
            return Ok(task);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating task {TaskId}", taskId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── DELETE /api/projects/{id}/tasks/{taskId} ──────────────────────────
    [HttpDelete("{id}/tasks/{taskId}")]
    public async Task<IActionResult> DeleteProjectTask(string id, string taskId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var result = await _projectService.DeleteProjectTaskAsync(uid, id, taskId);
            if (result == null)  return NotFound(new { error = "Project not found." });
            if (result == false) return NotFound(new { error = "Task not found." });
            return NoContent();
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting task {TaskId}", taskId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }
```

- [ ] **Step 2: Add Brief endpoints to `ProjectsController.cs`**

Add immediately after the Task endpoints:

```csharp
    // ── GET /api/projects/{id}/briefs ─────────────────────────────────────
    [HttpGet("{id}/briefs")]
    public async Task<IActionResult> GetProjectBriefs(string id)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var briefs = await _projectService.GetProjectBriefsAsync(uid, id);
            if (briefs == null) return NotFound(new { error = "Project not found." });
            return Ok(briefs);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching briefs for project {Id}", id);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── POST /api/projects/{id}/briefs ────────────────────────────────────
    [HttpPost("{id}/briefs")]
    public async Task<IActionResult> CreateProjectBrief(string id, [FromBody] CreateBriefRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var brief = await _projectService.CreateProjectBriefAsync(uid, id, request);
            if (brief == null) return NotFound(new { error = "Project not found." });
            return StatusCode(201, brief);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating brief for project {Id}", id);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── PUT /api/projects/{id}/briefs/{briefId} ───────────────────────────
    [HttpPut("{id}/briefs/{briefId}")]
    public async Task<IActionResult> UpdateProjectBrief(string id, string briefId, [FromBody] UpdateBriefRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var brief = await _projectService.UpdateProjectBriefAsync(uid, id, briefId, request);
            if (brief == null) return NotFound(new { error = "Brief not found." });
            return Ok(brief);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating brief {BriefId}", briefId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── DELETE /api/projects/{id}/briefs/{briefId} ────────────────────────
    [HttpDelete("{id}/briefs/{briefId}")]
    public async Task<IActionResult> DeleteProjectBrief(string id, string briefId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var result = await _projectService.DeleteProjectBriefAsync(uid, id, briefId);
            if (result == null)  return NotFound(new { error = "Project not found." });
            if (result == false) return NotFound(new { error = "Brief not found." });
            return NoContent();
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting brief {BriefId}", briefId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }
```

- [ ] **Step 3: Build**

```bash
cd backend/Teamgle.Api && dotnet build
```

Expected: `Build succeeded.`

- [ ] **Step 4: Start backend and smoke-test endpoints**

```bash
cd backend/Teamgle.Api && dotnet run
```

In a separate terminal, use curl or the browser to verify (replace `{projId}` with a real project ID from the DB, e.g. `bb93fed4-c6b3-48f1-8d38-0cd86919b597`). You need a valid Firebase Bearer token — log in via the frontend and copy it from DevTools → Application → sessionStorage or network request headers.

```bash
# Should return 200 with task array
curl -H "Authorization: Bearer {token}" http://localhost:5000/api/projects/{projId}/tasks

# Should return 200 with brief array (with manager names)
curl -H "Authorization: Bearer {token}" http://localhost:5000/api/projects/{projId}/briefs

# Should return 404
curl -H "Authorization: Bearer {token}" http://localhost:5000/api/projects/nonexistent-id/tasks
```

Expected responses:
- Tasks: `200 [{taskId, content, status, priority}, ...]`
- Briefs: `200 [{briefId, title, content, createdAt, createdByManagerId, createdByManagerName}, ...]`
- Nonexistent: `404 {"error":"Project not found."}`

---

## Task 7: Frontend HTML — Replace Placeholders

**Files:**
- Modify: `frontend/manager-dashboard.html`

Replace the "coming soon" placeholders for Tasks and Brief panels with empty list containers. The JS will populate them. Also reset the `_pdTasksData`/`_pdBriefsData` state on project open, so adding these empty containers is safe.

- [ ] **Step 1: Replace the tasks panel placeholder (lines 360–365)**

Find:
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
        <div class="pd-panel" data-tab-panel="tasks" style="display:none">
          <div class="pd-section-header">
            <h3 class="pd-section-title">Tasks</h3>
            <button class="pd-add-btn" id="btn-add-task">+ Add Task</button>
          </div>
          <div class="pd-task-list" id="pd-task-list"></div>
        </div>
```

- [ ] **Step 2: Replace the brief panel placeholder (lines 366–371)**

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
        <div class="pd-panel" data-tab-panel="brief" style="display:none">
          <div class="pd-section-header">
            <h3 class="pd-section-title">Briefs</h3>
            <button class="pd-add-btn" id="btn-add-brief">+ Add Brief</button>
          </div>
          <div class="pd-brief-list" id="pd-brief-list"></div>
        </div>
```

---

## Task 8: Frontend CSS — Tasks & Brief Styles

**Files:**
- Modify: `frontend/css/manager-dashboard.css`

Add all new styles at the end of the file, after the last existing block. Use only existing CSS variables (`--blue`, `--blue-light`, `--text`, `--text-muted`, `--border`, `--radius`, `--transition`, `--card`).

- [ ] **Step 1: Add styles at the end of `manager-dashboard.css`**

```css
/* ── Tasks & Briefs — Shared Layout ───────────────────────────────────── */

.pd-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.pd-section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.pd-add-btn {
  padding: 7px 16px;
  background: var(--blue);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition);
}
.pd-add-btn:hover { background: var(--blue-dark, #4563d4); }

/* ── Task List ────────────────────────────────────────────────────────── */

.pd-task-list,
.pd-brief-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pd-task-row,
.pd-brief-row {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  cursor: pointer;
  transition: background var(--transition), border-color var(--transition);
}
.pd-task-row:hover:not(.pd-row--expanded):not(.pd-row--deleting),
.pd-brief-row:hover:not(.pd-row--expanded):not(.pd-row--deleting) {
  background: var(--blue-light);
  border-color: #c7d3fa;
}
.pd-row--deleting {
  background: #fef2f2;
  border-color: #fecaca;
}

/* ── Row Summary (collapsed view) ─────────────────────────────────────── */

.pd-row-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
}

.pd-task-content {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  line-height: 1.4;
}

.pd-row-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* ── Badges ────────────────────────────────────────────────────────────── */

.pd-badge {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  text-transform: lowercase;
}

/* Status badges */
.pd-badge--status-open        { background: #f0f0f0; color: #6b7280; }
.pd-badge--status-in_progress { background: var(--blue-light); color: var(--blue); }
.pd-badge--status-done        { background: #f0fdf4; color: #16a34a; }
.pd-badge--status-canceled    { background: #fef2f2; color: #ef4444; }

/* Priority badges */
.pd-badge--priority-urgent { background: #fef2f2; color: #ef4444; }
.pd-badge--priority-high   { background: #fff7ed; color: #f97316; }
.pd-badge--priority-medium { background: var(--blue-light); color: var(--blue); }
.pd-badge--priority-low    { background: #f0f0f0; color: #6b7280; }

/* ── Delete button ─────────────────────────────────────────────────────── */

.pd-row-delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 14px;
  padding: 4px 6px;
  border-radius: 4px;
  transition: color var(--transition), background var(--transition);
  line-height: 1;
}
.pd-row-delete-btn:hover { color: #ef4444; background: #fef2f2; }

/* Delete confirm inline */
.pd-delete-confirm {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #ef4444;
  font-weight: 500;
}
.pd-delete-confirm button {
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background var(--transition);
}
.pd-delete-confirm .btn-confirm-yes { background: #ef4444; color: #fff; border-color: #ef4444; }
.pd-delete-confirm .btn-confirm-yes:hover { background: #dc2626; }
.pd-delete-confirm .btn-confirm-no  { background: #fff; color: var(--text-muted); border-color: var(--border); }
.pd-delete-confirm .btn-confirm-no:hover { background: #f3f4f6; }

/* ── Expand form (max-height animation — NO display:none) ──────────────── */

.pd-row-form {
  max-height: 0;
  overflow: hidden;
  transition: max-height 175ms ease-in-out, padding 175ms ease-in-out;
  padding: 0 16px;
}
.pd-row-form.expanded {
  max-height: 520px;
  padding: 0 16px 14px;
}

.pd-form-textarea {
  width: 100%;
  min-height: 70px;
  resize: vertical;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  color: var(--text);
  background: #fff;
  box-sizing: border-box;
  transition: border-color var(--transition);
  margin-bottom: 10px;
}
.pd-form-textarea:focus { outline: none; border-color: var(--blue); }

.pd-form-textarea--large { min-height: 120px; }

.pd-form-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  color: var(--text);
  background: #fff;
  box-sizing: border-box;
  transition: border-color var(--transition);
  margin-bottom: 10px;
}
.pd-form-input:focus { outline: none; border-color: var(--blue); }

.pd-form-selects {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}
.pd-form-select {
  flex: 1;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  color: var(--text);
  background: #fff;
  cursor: pointer;
  transition: border-color var(--transition);
}
.pd-form-select:focus { outline: none; border-color: var(--blue); }

.pd-form-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.pd-form-save-btn {
  padding: 7px 20px;
  background: var(--blue);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition), opacity var(--transition);
}
.pd-form-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pd-form-save-btn:not(:disabled):hover { background: var(--blue-dark, #4563d4); }

.pd-form-cancel-btn {
  padding: 7px 16px;
  background: none;
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: background var(--transition);
}
.pd-form-cancel-btn:hover { background: #f3f4f6; }

.pd-form-error {
  font-size: 12px;
  color: #ef4444;
  margin-left: 8px;
}

/* ── Brief row summary ─────────────────────────────────────────────────── */

.pd-brief-summary {
  flex: 1;
  min-width: 0;
}
.pd-brief-title-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 2px;
}
.pd-brief-preview-text {
  font-size: 13px;
  color: var(--text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
  margin-bottom: 4px;
}
.pd-brief-author-text {
  font-size: 12px;
  color: var(--text-muted);
}
.pd-brief-date-text {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Empty state ───────────────────────────────────────────────────────── */

.pd-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--text-muted);
  font-size: 14px;
  border: 2px dashed var(--border);
  border-radius: var(--radius);
  gap: 8px;
  text-align: center;
  padding: 24px;
}
.pd-empty-state .material-symbols-outlined { font-size: 36px; }

/* ── Loading skeleton ──────────────────────────────────────────────────── */
.pd-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  color: var(--text-muted);
  font-size: 14px;
  gap: 8px;
}

/* ── Responsive ────────────────────────────────────────────────────────── */

@media (max-width: 640px) {
  .pd-row-summary   { flex-wrap: wrap; }
  .pd-task-content  { width: 100%; flex: none; }
  .pd-row-meta      { width: 100%; justify-content: flex-end; }
  .pd-brief-summary { width: 100%; }
  .pd-form-selects  { flex-direction: column; }
  .pd-form-save-btn,
  .pd-form-cancel-btn { min-height: 44px; }
  .pd-add-btn       { min-height: 40px; }
}
```

---

## Task 9: Frontend JS — State, Reset, Tab Hooks

**Files:**
- Modify: `frontend/js/manager-dashboard.js`

This task adds state variables and wires up the tab activation hook. All changes are in the "project detail" section of the file (around lines 1368–1390).

- [ ] **Step 1: Add state variables after `_pdCalendar`**

Find this existing block (around line 1370):
```js
let currentProjectDetail = null; // holds last fetched ProjectDetailResponse
let _pdCalendar          = null; // FullCalendar instance
```

Add immediately after:
```js
let _pdTasksData   = null;  // TaskItem[] once loaded; null = not yet fetched for this project
let _pdBriefsData  = null;  // BriefItem[] once loaded; null = not yet fetched
let _expandedRow   = null;  // the currently expanded row DOM element | null
```

- [ ] **Step 2: Reset state in `openProjectDetail()`**

Find the start of `openProjectDetail()` (around line 1392):
```js
async function openProjectDetail(projId) {
  currentProjectDetail = null;
  activateProjectTab('dashboard');
```

Add three reset lines and DOM clears right after `currentProjectDetail = null;`:
```js
  _pdTasksData  = null;
  _pdBriefsData = null;
  _expandedRow  = null;
  const taskList  = document.getElementById('pd-task-list');
  const briefList = document.getElementById('pd-brief-list');
  if (taskList)  taskList.innerHTML  = '';
  if (briefList) briefList.innerHTML = '';
```

- [ ] **Step 3: Hook render functions into `activateProjectTab()`**

Find the existing tab activation hook (around line 1388):
```js
  if (name === 'schedule') renderScheduleCalendar();
```

Add two more lines immediately after:
```js
  if (name === 'tasks') renderTasksTab();
  if (name === 'brief') renderBriefTab();
```

- [ ] **Step 4: Wire "Add Task" and "Add Brief" button click listeners**

In the existing section where tab click listeners are registered (look for `document.querySelectorAll('.pd-tab').forEach`), add delegation for the Add buttons. Since the buttons are inside the panel HTML, use event delegation on `document` (or the section):

Find the block that registers tab listeners (around line 1378):
```js
document.querySelectorAll('.pd-tab').forEach(tab => {
  tab.addEventListener('click', () => activateProjectTab(tab.dataset.tab));
});
```

Add after this block:
```js
document.getElementById('btn-add-task')?.addEventListener('click', () => addNewTaskRow());
document.getElementById('btn-add-brief')?.addEventListener('click', () => addNewBriefRow());
```

---

## Task 10: Frontend JS — Tasks Tab (Render + CRUD)

**Files:**
- Modify: `frontend/js/manager-dashboard.js`

Add all task-related functions after `renderScheduleCalendar()`. These functions form a self-contained module for the Tasks tab.

- [ ] **Step 1: Add helper functions and `renderTasksTab()`**

Add after the closing `}` of `renderScheduleCalendar()`:

```js
// ════════════════════════════════════════════════════════════════════════════
// TASKS TAB
// ════════════════════════════════════════════════════════════════════════════

const TASK_STATUSES   = ['open', 'in_progress', 'done', 'canceled'];
const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

function taskStatusLabel(s)   { return { open: 'Open', in_progress: 'In Progress', done: 'Done', canceled: 'Canceled' }[s] ?? s; }
function taskPriorityLabel(p) { return { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }[p] ?? p; }

function buildTaskRow(task) {
  const row = document.createElement('div');
  row.className = 'pd-task-row';
  row.dataset.taskId = task.taskId;
  row.innerHTML = `
    <div class="pd-row-summary">
      <span class="pd-task-content">${escapeHtml(task.content)}</span>
      <div class="pd-row-meta">
        <span class="pd-badge pd-badge--priority-${task.priority}">${taskPriorityLabel(task.priority)}</span>
        <span class="pd-badge pd-badge--status-${task.status}">${taskStatusLabel(task.status)}</span>
        <button class="pd-row-delete-btn" title="Delete task" type="button">✕</button>
      </div>
    </div>
    <div class="pd-row-form">
      <textarea class="pd-form-textarea" name="content" rows="3">${escapeHtml(task.content)}</textarea>
      <div class="pd-form-selects">
        <select class="pd-form-select" name="status">
          ${TASK_STATUSES.map(s => `<option value="${s}" ${task.status === s ? 'selected' : ''}>${taskStatusLabel(s)}</option>`).join('')}
        </select>
        <select class="pd-form-select" name="priority">
          ${TASK_PRIORITIES.map(p => `<option value="${p}" ${task.priority === p ? 'selected' : ''}>${taskPriorityLabel(p)}</option>`).join('')}
        </select>
      </div>
      <div class="pd-form-actions">
        <button class="pd-form-save-btn" type="button" disabled>Save</button>
        <button class="pd-form-cancel-btn" type="button">Cancel</button>
        <span class="pd-form-error" style="display:none"></span>
      </div>
    </div>
  `;
  wireTaskRow(row, task);
  return row;
}

function wireTaskRow(row, originalTask) {
  const form      = row.querySelector('.pd-row-form');
  const summary   = row.querySelector('.pd-row-summary');
  const textarea  = row.querySelector('textarea[name="content"]');
  const selStatus = row.querySelector('select[name="status"]');
  const selPriority = row.querySelector('select[name="priority"]');
  const saveBtn   = row.querySelector('.pd-form-save-btn');
  const cancelBtn = row.querySelector('.pd-form-cancel-btn');
  const deleteBtn = row.querySelector('.pd-row-delete-btn');
  const errorEl   = row.querySelector('.pd-form-error');

  // Track original values for dirty-check
  let orig = { content: originalTask.content, status: originalTask.status, priority: originalTask.priority };
  const isNew = () => row.dataset.new === 'true';

  function checkDirty() {
    if (isNew()) {
      saveBtn.disabled = textarea.value.trim() === '';
    } else {
      saveBtn.disabled = (
        textarea.value.trim() === orig.content &&
        selStatus.value       === orig.status  &&
        selPriority.value     === orig.priority
      );
    }
  }

  // Expand/collapse
  function expand() {
    if (_expandedRow && _expandedRow !== row) collapseRow(_expandedRow);
    form.classList.add('expanded');
    row.classList.add('pd-row--expanded');
    _expandedRow = row;
    textarea.focus();
    checkDirty();
  }
  function collapse() {
    form.classList.remove('expanded');
    row.classList.remove('pd-row--expanded');
    if (_expandedRow === row) _expandedRow = null;
  }

  row.addEventListener('click', (e) => {
    if (e.target.closest('.pd-row-delete-btn') ||
        e.target.closest('.pd-delete-confirm') ||
        row.classList.contains('pd-row--expanded')) return;
    expand();
  });

  textarea.addEventListener('input', checkDirty);
  selStatus.addEventListener('change', checkDirty);
  selPriority.addEventListener('change', checkDirty);

  cancelBtn.addEventListener('click', () => {
    if (isNew()) { row.remove(); if (_expandedRow === row) _expandedRow = null; return; }
    textarea.value    = orig.content;
    selStatus.value   = orig.status;
    selPriority.value = orig.priority;
    errorEl.style.display = 'none';
    collapse();
  });

  saveBtn.addEventListener('click', async () => {
    const content  = textarea.value.trim();
    const status   = selStatus.value;
    const priority = selPriority.value;
    if (!content) return;

    saveBtn.textContent = 'Saving…';
    saveBtn.disabled    = true;
    cancelBtn.disabled  = true;
    textarea.disabled = selStatus.disabled = selPriority.disabled = true;
    errorEl.style.display = 'none';

    try {
      const token  = await getToken();
      const projId = currentProjectDetail.projId;
      let saved;

      if (isNew()) {
        const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(projId)}/tasks`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, status, priority }),
        });
        if (!res.ok) throw new Error(await res.text());
        saved = await res.json();
        row.dataset.taskId = saved.taskId;
        delete row.dataset.new;
        _pdTasksData.push(saved);
      } else {
        const taskId = row.dataset.taskId;
        const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(projId)}/tasks/${encodeURIComponent(taskId)}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, status, priority }),
        });
        if (!res.ok) throw new Error(await res.text());
        saved = await res.json();
        const idx = _pdTasksData.findIndex(t => t.taskId === taskId);
        if (idx !== -1) _pdTasksData[idx] = saved;
      }

      // Update summary in-place
      orig = { content: saved.content, status: saved.status, priority: saved.priority };
      row.querySelector('.pd-task-content').textContent = saved.content;
      row.querySelector('.pd-row-meta').innerHTML = `
        <span class="pd-badge pd-badge--priority-${saved.priority}">${taskPriorityLabel(saved.priority)}</span>
        <span class="pd-badge pd-badge--status-${saved.status}">${taskStatusLabel(saved.status)}</span>
        <button class="pd-row-delete-btn" title="Delete task" type="button">✕</button>
      `;
      wireDeleteBtn(row);
      collapse();
    } catch {
      errorEl.textContent   = 'Failed to save. Please try again.';
      errorEl.style.display = 'inline';
    } finally {
      saveBtn.textContent = 'Save';
      saveBtn.disabled    = false;
      cancelBtn.disabled  = false;
      textarea.disabled = selStatus.disabled = selPriority.disabled = false;
      checkDirty();
    }
  });

  wireDeleteBtn(row);
}

function wireDeleteBtn(row) {
  const metaEl    = row.querySelector('.pd-row-meta');
  const deleteBtn = row.querySelector('.pd-row-delete-btn');
  if (!deleteBtn) return;

  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const originalMeta = metaEl.innerHTML;
    row.classList.add('pd-row--deleting');
    metaEl.innerHTML = `
      <div class="pd-delete-confirm">
        Confirm delete?
        <button class="btn-confirm-yes" type="button">Yes</button>
        <button class="btn-confirm-no"  type="button">No</button>
      </div>
    `;
    metaEl.querySelector('.btn-confirm-no').addEventListener('click', (e) => {
      e.stopPropagation();
      row.classList.remove('pd-row--deleting');
      metaEl.innerHTML = originalMeta;
      wireDeleteBtn(row);
    });
    metaEl.querySelector('.btn-confirm-yes').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const token  = await getToken();
        const projId = currentProjectDetail.projId;
        const taskId = row.dataset.taskId;
        const res    = await fetch(
          `${API_BASE}/projects/${encodeURIComponent(projId)}/tasks/${encodeURIComponent(taskId)}`,
          { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (!res.ok && res.status !== 204) throw new Error();
        _pdTasksData = _pdTasksData.filter(t => t.taskId !== taskId);
        if (_expandedRow === row) _expandedRow = null;
        row.remove();
        if (_pdTasksData.length === 0) {
          document.getElementById('pd-task-list').innerHTML = taskEmptyStateHtml();
        }
      } catch {
        row.classList.remove('pd-row--deleting');
        metaEl.innerHTML = originalMeta;
        wireDeleteBtn(row);
      }
    });
  });
}

function collapseRow(row) {
  if (!row) return;
  row.querySelector('.pd-row-form')?.classList.remove('expanded');
  row.classList.remove('pd-row--expanded');
}

function taskEmptyStateHtml() {
  return `<div class="pd-empty-state">
    <span class="material-symbols-outlined">task_alt</span>
    <p>No tasks yet. Start by adding your first task.</p>
  </div>`;
}

async function renderTasksTab() {
  if (_pdTasksData !== null) return; // already loaded for this project

  const list = document.getElementById('pd-task-list');
  if (!list) return;

  list.innerHTML = '<div class="pd-loading">Loading tasks…</div>';

  try {
    const token = await getToken();
    const res   = await fetch(
      `${API_BASE}/projects/${encodeURIComponent(currentProjectDetail.projId)}/tasks`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _pdTasksData = await res.json();
  } catch {
    list.innerHTML = '<div class="pd-empty-state">Failed to load tasks. Please try again.</div>';
    _pdTasksData = null; // allow retry
    return;
  }

  list.innerHTML = '';
  if (_pdTasksData.length === 0) {
    list.innerHTML = taskEmptyStateHtml();
  } else {
    _pdTasksData.forEach(t => list.appendChild(buildTaskRow(t)));
  }
}

function addNewTaskRow() {
  const list = document.getElementById('pd-task-list');
  if (!list) return;
  if (list.querySelector('[data-new="true"]')) return; // guard: only one new row at a time

  const newTask = { taskId: '', content: '', status: 'open', priority: 'medium' };
  const row     = buildTaskRow(newTask);
  row.dataset.new = 'true';

  // Remove empty state if present
  list.querySelector('.pd-empty-state')?.remove();
  list.prepend(row);

  // Expand immediately (collapses any open row first)
  if (_expandedRow && _expandedRow !== row) collapseRow(_expandedRow);
  row.querySelector('.pd-row-form').classList.add('expanded');
  row.classList.add('pd-row--expanded');
  _expandedRow = row;
  row.querySelector('textarea').focus();
  row.querySelector('.pd-form-save-btn').disabled = true; // empty content — save disabled
}
```

---

## Task 11: Frontend JS — Briefs Tab (Render + CRUD)

**Files:**
- Modify: `frontend/js/manager-dashboard.js`

Add brief functions immediately after the task functions added in Task 10.

- [ ] **Step 1: Add `renderBriefTab()` and Brief CRUD functions**

```js
// ════════════════════════════════════════════════════════════════════════════
// BRIEFS TAB
// ════════════════════════════════════════════════════════════════════════════

function formatBriefDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('he-IL');
}

function buildBriefRow(brief) {
  const row = document.createElement('div');
  row.className = 'pd-brief-row';
  row.dataset.briefId = brief.briefId;
  const authorName = brief.createdByManagerName ?? 'Unknown';
  row.innerHTML = `
    <div class="pd-row-summary">
      <div class="pd-brief-summary">
        <div class="pd-brief-title-text">${escapeHtml(brief.title)}</div>
        <div class="pd-brief-preview-text">${escapeHtml(brief.content)}</div>
        <div class="pd-brief-author-text">Created by: ${escapeHtml(authorName)}</div>
      </div>
      <div class="pd-row-meta">
        <span class="pd-brief-date-text">${formatBriefDate(brief.createdAt)}</span>
        <button class="pd-row-delete-btn" title="Delete brief" type="button">✕</button>
      </div>
    </div>
    <div class="pd-row-form">
      <input class="pd-form-input" type="text" name="title" value="${escapeHtml(brief.title)}" placeholder="Brief title" />
      <textarea class="pd-form-textarea pd-form-textarea--large" name="content" rows="6">${escapeHtml(brief.content)}</textarea>
      <div class="pd-form-actions">
        <button class="pd-form-save-btn" type="button" disabled>Save</button>
        <button class="pd-form-cancel-btn" type="button">Cancel</button>
        <span class="pd-form-error" style="display:none"></span>
      </div>
    </div>
  `;
  wireBriefRow(row, brief);
  return row;
}

function wireBriefRow(row, originalBrief) {
  const form      = row.querySelector('.pd-row-form');
  const titleInput = row.querySelector('input[name="title"]');
  const textarea  = row.querySelector('textarea[name="content"]');
  const saveBtn   = row.querySelector('.pd-form-save-btn');
  const cancelBtn = row.querySelector('.pd-form-cancel-btn');
  const errorEl   = row.querySelector('.pd-form-error');

  let orig = { title: originalBrief.title, content: originalBrief.content };
  const isNew = () => row.dataset.new === 'true';

  function checkDirty() {
    if (isNew()) {
      saveBtn.disabled = titleInput.value.trim() === '' || textarea.value.trim() === '';
    } else {
      saveBtn.disabled = (
        titleInput.value.trim() === orig.title &&
        textarea.value.trim()   === orig.content
      );
    }
  }

  function expand() {
    if (_expandedRow && _expandedRow !== row) collapseRow(_expandedRow);
    form.classList.add('expanded');
    row.classList.add('pd-row--expanded');
    _expandedRow = row;
    titleInput.focus();
    checkDirty();
  }
  function collapse() {
    form.classList.remove('expanded');
    row.classList.remove('pd-row--expanded');
    if (_expandedRow === row) _expandedRow = null;
  }

  row.addEventListener('click', (e) => {
    if (e.target.closest('.pd-row-delete-btn') ||
        e.target.closest('.pd-delete-confirm') ||
        row.classList.contains('pd-row--expanded')) return;
    expand();
  });

  titleInput.addEventListener('input', checkDirty);
  textarea.addEventListener('input', checkDirty);

  cancelBtn.addEventListener('click', () => {
    if (isNew()) { row.remove(); if (_expandedRow === row) _expandedRow = null; return; }
    titleInput.value = orig.title;
    textarea.value   = orig.content;
    errorEl.style.display = 'none';
    collapse();
  });

  saveBtn.addEventListener('click', async () => {
    const title   = titleInput.value.trim();
    const content = textarea.value.trim();
    if (!title || !content) return;

    saveBtn.textContent = 'Saving…';
    saveBtn.disabled = cancelBtn.disabled = true;
    titleInput.disabled = textarea.disabled = true;
    errorEl.style.display = 'none';

    try {
      const token  = await getToken();
      const projId = currentProjectDetail.projId;
      let saved;

      if (isNew()) {
        const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(projId)}/briefs`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content }),
        });
        if (!res.ok) throw new Error(await res.text());
        saved = await res.json();
        row.dataset.briefId = saved.briefId;
        delete row.dataset.new;
        _pdBriefsData.push(saved);
      } else {
        const briefId = row.dataset.briefId;
        const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(projId)}/briefs/${encodeURIComponent(briefId)}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content }),
        });
        if (!res.ok) throw new Error(await res.text());
        saved = await res.json();
        const idx = _pdBriefsData.findIndex(b => b.briefId === briefId);
        if (idx !== -1) _pdBriefsData[idx] = saved;
      }

      orig = { title: saved.title, content: saved.content };
      const authorName = saved.createdByManagerName ?? 'Unknown';
      row.querySelector('.pd-brief-title-text').textContent  = saved.title;
      row.querySelector('.pd-brief-preview-text').textContent = saved.content;
      row.querySelector('.pd-brief-author-text').textContent  = `Created by: ${authorName}`;
      row.querySelector('.pd-brief-date-text').textContent   = formatBriefDate(saved.createdAt);
      row.querySelector('.pd-row-meta').innerHTML = `
        <span class="pd-brief-date-text">${formatBriefDate(saved.createdAt)}</span>
        <button class="pd-row-delete-btn" title="Delete brief" type="button">✕</button>
      `;
      wireBriefDeleteBtn(row);
      collapse();
    } catch {
      errorEl.textContent   = 'Failed to save. Please try again.';
      errorEl.style.display = 'inline';
    } finally {
      saveBtn.textContent = 'Save';
      saveBtn.disabled = cancelBtn.disabled = false;
      titleInput.disabled = textarea.disabled = false;
      checkDirty();
    }
  });

  wireBriefDeleteBtn(row);
}

function wireBriefDeleteBtn(row) {
  const metaEl    = row.querySelector('.pd-row-meta');
  const deleteBtn = row.querySelector('.pd-row-delete-btn');
  if (!deleteBtn) return;

  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const originalMeta = metaEl.innerHTML;
    row.classList.add('pd-row--deleting');
    metaEl.innerHTML = `
      <div class="pd-delete-confirm">
        Confirm delete?
        <button class="btn-confirm-yes" type="button">Yes</button>
        <button class="btn-confirm-no"  type="button">No</button>
      </div>
    `;
    metaEl.querySelector('.btn-confirm-no').addEventListener('click', (e) => {
      e.stopPropagation();
      row.classList.remove('pd-row--deleting');
      metaEl.innerHTML = originalMeta;
      wireBriefDeleteBtn(row);
    });
    metaEl.querySelector('.btn-confirm-yes').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const token   = await getToken();
        const projId  = currentProjectDetail.projId;
        const briefId = row.dataset.briefId;
        const res     = await fetch(
          `${API_BASE}/projects/${encodeURIComponent(projId)}/briefs/${encodeURIComponent(briefId)}`,
          { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (!res.ok && res.status !== 204) throw new Error();
        _pdBriefsData = _pdBriefsData.filter(b => b.briefId !== briefId);
        if (_expandedRow === row) _expandedRow = null;
        row.remove();
        if (_pdBriefsData.length === 0) {
          document.getElementById('pd-brief-list').innerHTML = briefEmptyStateHtml();
        }
      } catch {
        row.classList.remove('pd-row--deleting');
        metaEl.innerHTML = originalMeta;
        wireBriefDeleteBtn(row);
      }
    });
  });
}

function briefEmptyStateHtml() {
  return `<div class="pd-empty-state">
    <span class="material-symbols-outlined">description</span>
    <p>No briefs yet. Start by adding your first brief.</p>
  </div>`;
}

async function renderBriefTab() {
  if (_pdBriefsData !== null) return;

  const list = document.getElementById('pd-brief-list');
  if (!list) return;

  list.innerHTML = '<div class="pd-loading">Loading briefs…</div>';

  try {
    const token = await getToken();
    const res   = await fetch(
      `${API_BASE}/projects/${encodeURIComponent(currentProjectDetail.projId)}/briefs`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _pdBriefsData = await res.json();
  } catch {
    list.innerHTML = '<div class="pd-empty-state">Failed to load briefs. Please try again.</div>';
    _pdBriefsData = null;
    return;
  }

  list.innerHTML = '';
  if (_pdBriefsData.length === 0) {
    list.innerHTML = briefEmptyStateHtml();
  } else {
    _pdBriefsData.forEach(b => list.appendChild(buildBriefRow(b)));
  }
}

function addNewBriefRow() {
  const list = document.getElementById('pd-brief-list');
  if (!list) return;
  if (list.querySelector('[data-new="true"]')) return;

  const newBrief = { briefId: '', title: '', content: '', createdAt: null, createdByManagerId: '', createdByManagerName: null };
  const row      = buildBriefRow(newBrief);
  row.dataset.new = 'true';

  list.querySelector('.pd-empty-state')?.remove();
  list.prepend(row);

  if (_expandedRow && _expandedRow !== row) collapseRow(_expandedRow);
  row.querySelector('.pd-row-form').classList.add('expanded');
  row.classList.add('pd-row--expanded');
  _expandedRow = row;
  row.querySelector('input[name="title"]').focus();
  row.querySelector('.pd-form-save-btn').disabled = true;
}
```

---

## Task 12: End-to-End Validation with Playwright

**Files:** (no code changes — validation only)

Prerequisites:
- Backend running: `cd backend/Teamgle.Api && dotnet run` (port 5000)
- Frontend served: VS Code Live Server at `http://127.0.0.1:5500`
- At least one project exists with tasks and briefs (project `bb93fed4-c6b3-48f1-8d38-0cd86919b597` has both)

- [ ] **Step 1: Log in and navigate to a project**

Open Chrome (with debugging port), navigate to `http://127.0.0.1:5500/auth.html`, sign in as manager. Verify redirect to `manager-dashboard.html`. Click a project card to open project detail.

- [ ] **Step 2: Validate Tasks tab — list renders**

Click "Tasks" tab. Verify:
- Task rows appear (not "coming soon")
- Each row has content text (left), priority badge, status badge, delete button
- No console errors

- [ ] **Step 3: Validate Tasks tab — expand/collapse**

Click a task row. Verify:
- Row expands with textarea, status select, priority select
- Save button is disabled (no changes yet)
- Hover over another row → click it → first row collapses, second expands

- [ ] **Step 4: Validate Tasks tab — edit and save**

Change the status select value. Verify Save button becomes enabled. Click Save. Verify:
- "Saving…" appears briefly
- Row collapses with updated badge
- No extra network request on clicking Tasks tab again (data cached)

- [ ] **Step 5: Validate Tasks tab — create new task**

Click "+ Add Task". Verify:
- New blank row appears at top, expanded
- Save disabled (empty content)
- Type content → Save becomes enabled
- Set status + priority → Save → row added to list with correct badges

Click "+ Add Task" again while new row exists → verify no second blank row appears.

- [ ] **Step 6: Validate Tasks tab — delete task**

Click delete (✕) on a task row. Verify:
- Row turns light red
- "Confirm delete?" appears with Yes/No
- Click No → row restores to normal
- Click ✕ again → click Yes → row removed; if last task, empty state appears

- [ ] **Step 7: Validate Briefs tab — list renders**

Click "Brief" tab. Verify:
- Brief rows appear with title (bold), content preview (2 lines clamped), author name, date
- Rows are ordered newest first
- Manager name shows correctly (not "null", not missing)
- No console errors

- [ ] **Step 8: Validate Briefs tab — edit and save**

Click a brief row to expand. Verify title input and content textarea. Change title → Save disabled or enabled correctly. Save → row updates in-place.

- [ ] **Step 9: Validate Briefs tab — create new brief**

Click "+ Add Brief" → blank row appears at top. Fill title + content → Save → new brief appears in list with today's date and current manager's name.

- [ ] **Step 10: Validate Briefs tab — delete brief**

Delete a brief → confirm → row removed. Delete last brief → empty state shows.

- [ ] **Step 11: Validate project switching**

Open project A → go to Tasks tab → open project B → go to Tasks tab. Verify project B's tasks load (not project A's). Verify no stale data.

- [ ] **Step 12: Validate all other tabs still work**

Click Dashboard, Employees, Schedule, Finance tabs — verify they render their existing content without errors.

- [ ] **Step 13: Validate mobile layout**

In DevTools, switch to a mobile viewport (375px width). Verify:
- Task content stacks vertically above badges
- Selects stack vertically in the form
- Buttons are at least 40px tall
- No horizontal overflow

---

## Task 13: Commit

- [ ] **Step 1: Verify clean build and no console errors**

```bash
cd backend/Teamgle.Api && dotnet build
```

Expected: `Build succeeded.`

- [ ] **Step 2: Stage and commit all backend changes**

```bash
cd c:/Users/roies/Desktop/Teamgle_App
git add backend/Teamgle.Api/Models/DTOs/TaskItem.cs \
        backend/Teamgle.Api/Models/DTOs/CreateTaskRequest.cs \
        backend/Teamgle.Api/Models/DTOs/UpdateTaskRequest.cs \
        backend/Teamgle.Api/Models/DTOs/BriefItem.cs \
        backend/Teamgle.Api/Models/DTOs/CreateBriefRequest.cs \
        backend/Teamgle.Api/Models/DTOs/UpdateBriefRequest.cs \
        backend/Teamgle.Api/Repositories/IProjectRepository.cs \
        backend/Teamgle.Api/Repositories/ProjectRepository.cs \
        backend/Teamgle.Api/Services/IProjectService.cs \
        backend/Teamgle.Api/Services/ProjectService.cs \
        backend/Teamgle.Api/Controllers/ProjectsController.cs
git commit -m "$(cat <<'EOF'
feat: add full CRUD API for project tasks and briefs

Adds 8 new endpoints (GET/POST/PUT/DELETE for /api/projects/{id}/tasks
and /api/projects/{id}/briefs). Follows existing Controller → Service →
Repository pattern. Shared access-check helper in ProjectRepository.
Brief GET joins [User] to return manager name.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Stage and commit all frontend changes**

```bash
git add frontend/manager-dashboard.html \
        frontend/css/manager-dashboard.css \
        frontend/js/manager-dashboard.js
git commit -m "$(cat <<'EOF'
feat: implement Tasks and Brief tabs with full inline CRUD UI

Replaces coming-soon placeholders with live task/brief lists. Inline
expand-in-place interaction with max-height animation, single-expand
guard, dirty-check save button, delete confirmation with light-red
highlight, and empty state handling. Responsive for mobile.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Commit updated docs**

```bash
git add docs/superpowers/specs/2026-03-23-project-tasks-brief-design.md \
        docs/superpowers/plans/2026-03-23-project-tasks-brief.md
git commit -m "$(cat <<'EOF'
docs: update tasks+brief spec and plan to full CRUD design

Replaces the previous read-only spec with the full CRUD design including
inline expand interaction, 8 endpoints, badge color-coding, responsive
layout, and future employee acknowledgment notes.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Summary

**What this builds:**
- 8 REST endpoints (full CRUD for Tasks + Briefs per project)
- Inline expand-in-place UI with `max-height` CSS animation (175ms)
- Task rows: content, status badge, priority badge; form with textarea + two selects
- Brief rows: title, 2-line content preview, author name, date; form with title input + textarea
- Single-row expand guard, dirty-check Save, saving state, delete confirm with light-red row, empty states, loading states
- Mobile responsive: vertical stack, touch-friendly buttons
- State reset on project switch; DOM cleared in `openProjectDetail()`
- Future employee acknowledgment: add `Employee_Brief_Acknowledgment` table + `isAcknowledged` flag to GET briefs — no schema changes to `Brief` needed
