# Staffing Logic — Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full manager-side staffing flow: load Shift Applicants / Approved / Hold / Rejected sections from SQL, wire Approve/Hold/Reject/Return-to-Pool actions, and auto-poll every 15 seconds.

**Architecture:** Single `GET /api/events/{eventId}/workers` endpoint returns all workers grouped by status bucket. PATCH updates status, DELETE removes assignment. Frontend polls all events every 15s while the Employees tab is active. Action buttons use event delegation and update optimistically, confirmed by next poll.

**Tech Stack:** ASP.NET Core 8, SQL Server (Microsoft.Data.SqlClient), Vanilla JS, no test framework — verify manually via `dotnet run` + browser.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/Teamgle.Api/Models/DTOs/EventWorkersResponse.cs` | **Create** | DTOs for workers-by-status response |
| `backend/Teamgle.Api/Models/DTOs/UpdateWorkerStatusRequest.cs` | **Create** | PATCH request body |
| `backend/Teamgle.Api/Repositories/IProjectRepository.cs` | **Modify** | Add 3 method signatures |
| `backend/Teamgle.Api/Repositories/ProjectRepository.cs` | **Modify** | Add 3 SQL implementations |
| `backend/Teamgle.Api/Services/IProjectService.cs` | **Modify** | Add 3 method signatures |
| `backend/Teamgle.Api/Services/ProjectService.cs` | **Modify** | Add 3 delegating implementations |
| `backend/Teamgle.Api/Controllers/ShiftsController.cs` | **Modify** | Add 3 endpoints |
| `frontend/js/manager-dashboard.js` | **Modify** | Load workers, poll, action buttons |

---

## Task 1: Create new branch

- [ ] **Step 1: Branch from employees**

```bash
cd c:/Users/roies/Desktop/Teamgle_App
git checkout -b feature/staffing-full-logic
```

Expected: `Switched to a new branch 'feature/staffing-full-logic'`

---

## Task 2: DTOs

**Files:**
- Create: `backend/Teamgle.Api/Models/DTOs/EventWorkersResponse.cs`
- Create: `backend/Teamgle.Api/Models/DTOs/UpdateWorkerStatusRequest.cs`

- [ ] **Step 1: Create EventWorkersResponse.cs**

```csharp
namespace Teamgle.Api.Models.DTOs;

public class EventWorkersResponse
{
    public List<AssignedWorkerItem> Applicants { get; set; } = [];
    public List<AssignedWorkerItem> Approved   { get; set; } = [];
    public List<AssignedWorkerItem> Hold       { get; set; } = [];
    public List<AssignedWorkerItem> Rejected   { get; set; } = [];
}

public class AssignedWorkerItem
{
    public string ShiftId   { get; set; } = "";
    public string UserId    { get; set; } = "";
    public string FbUid     { get; set; } = "";
    public string FirstName { get; set; } = "";
    public string LastName  { get; set; } = "";
    public string RoleName  { get; set; } = "";
    public string Status    { get; set; } = "";
}
```

- [ ] **Step 2: Create UpdateWorkerStatusRequest.cs**

```csharp
namespace Teamgle.Api.Models.DTOs;

public class UpdateWorkerStatusRequest
{
    public string Status { get; set; } = "";
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/Teamgle.Api/Models/DTOs/EventWorkersResponse.cs \
        backend/Teamgle.Api/Models/DTOs/UpdateWorkerStatusRequest.cs
git commit -m "feat: add EventWorkersResponse and UpdateWorkerStatusRequest DTOs"
```

---

## Task 3: Repository — interface

**Files:**
- Modify: `backend/Teamgle.Api/Repositories/IProjectRepository.cs`

- [ ] **Step 1: Add 3 method signatures after the `SendOfferToEmployeeAsync` line**

Open `IProjectRepository.cs`. After:
```csharp
Task SendOfferToEmployeeAsync(string projId, string eventId, string employeeFbUid, List<string> shiftIds, string firebaseUid);
```

Add:
```csharp
    // ── Event Workers (Staffing) ───────────────────────────────────────────
    Task<EventWorkersResponse> GetEventWorkersAsync(string eventId, string firebaseUid);
    Task UpdateWorkerStatusAsync(string eventId, string employeeFbUid, string newStatus, string managerFbUid);
    Task DeleteWorkerAssignmentAsync(string eventId, string employeeFbUid, string managerFbUid);
```

- [ ] **Step 2: Build to verify no compile errors**

```bash
cd backend/Teamgle.Api
dotnet build
```

Expected: `Build succeeded. 0 Error(s)`

- [ ] **Step 3: Commit**

```bash
git add backend/Teamgle.Api/Repositories/IProjectRepository.cs
git commit -m "feat: add event workers repository interface methods"
```

---

## Task 4: Repository — SQL implementations

**Files:**
- Modify: `backend/Teamgle.Api/Repositories/ProjectRepository.cs`

Add the following 3 methods at the bottom of `ProjectRepository`, before the final closing `}`.

- [ ] **Step 1: Add GetEventWorkersAsync**

```csharp
    // ── Get all assigned workers for an event, grouped by status ─────────
    public async Task<EventWorkersResponse> GetEventWorkersAsync(string eventId, string firebaseUid)
    {
        const string sql = """
            SELECT
                es.shift_ID   AS ShiftId,
                u.user_ID     AS UserId,
                u.FBUID       AS FbUid,
                u.firstName   AS FirstName,
                u.lastName    AS LastName,
                r.Roll_name   AS RoleName,
                es.status     AS Status
            FROM Employee_Shift es
            INNER JOIN [User]  u  ON u.user_ID  = es.employee_user_ID
            INNER JOIN Shift   s  ON s.Shift_ID = es.shift_ID
            INNER JOIN Roll    r  ON r.Roll_ID  = s.roll_ID
            INNER JOIN Event   e  ON e.event_ID = s.event_ID
            INNER JOIN Project p  ON p.Proj_ID  = e.project_ID
            INNER JOIN Manager_Project mp ON mp.project_ID = p.Proj_ID
            INNER JOIN [User]  mu ON mu.user_ID = mp.manager_user_ID
            WHERE e.event_ID  = @eventId
              AND mu.FBUID    = @firebaseUid
              AND es.status  IN (
                  'employee_request',
                  'manager_approved',
                  'manager_hold',
                  'manager_reject',
                  'manager_approved_canceled'
              )
            """;

        var result = new EventWorkersResponse();

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@eventId",     eventId);
        cmd.Parameters.AddWithValue("@firebaseUid", firebaseUid);

        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            var item = new AssignedWorkerItem
            {
                ShiftId   = reader["ShiftId"].ToString()   ?? "",
                UserId    = reader["UserId"].ToString()    ?? "",
                FbUid     = reader["FbUid"].ToString()     ?? "",
                FirstName = reader["FirstName"].ToString() ?? "",
                LastName  = reader["LastName"].ToString()  ?? "",
                RoleName  = reader["RoleName"].ToString()  ?? "",
                Status    = reader["Status"].ToString()    ?? "",
            };

            switch (item.Status)
            {
                case "employee_request":           result.Applicants.Add(item); break;
                case "manager_approved":           result.Approved.Add(item);   break;
                case "manager_hold":               result.Hold.Add(item);       break;
                case "manager_reject":
                case "manager_approved_canceled":  result.Rejected.Add(item);   break;
            }
        }

        return result;
    }
```

- [ ] **Step 2: Add UpdateWorkerStatusAsync**

```csharp
    // ── Update status for all of an employee's shifts in an event ─────────
    public async Task UpdateWorkerStatusAsync(
        string eventId, string employeeFbUid, string newStatus, string managerFbUid)
    {
        const string sql = """
            UPDATE Employee_Shift
            SET    status            = @newStatus,
                   status_updated_at = GETUTCDATE()
            WHERE  employee_user_ID  = (SELECT user_ID FROM [User] WHERE FBUID = @employeeFbUid)
              AND  shift_ID IN (
                  SELECT s.Shift_ID
                  FROM   Shift s
                  INNER JOIN Event           e  ON e.event_ID   = s.event_ID
                  INNER JOIN Project         p  ON p.Proj_ID    = e.project_ID
                  INNER JOIN Manager_Project mp ON mp.project_ID = p.Proj_ID
                  INNER JOIN [User]          mu ON mu.user_ID   = mp.manager_user_ID
                  WHERE e.event_ID = @eventId
                    AND mu.FBUID   = @managerFbUid
              )
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@newStatus",      newStatus);
        cmd.Parameters.AddWithValue("@employeeFbUid",  employeeFbUid);
        cmd.Parameters.AddWithValue("@eventId",        eventId);
        cmd.Parameters.AddWithValue("@managerFbUid",   managerFbUid);

        await conn.OpenAsync();
        await cmd.ExecuteNonQueryAsync();
    }
```

- [ ] **Step 3: Add DeleteWorkerAssignmentAsync**

```csharp
    // ── Delete all Employee_Shift rows for an employee in an event ────────
    public async Task DeleteWorkerAssignmentAsync(
        string eventId, string employeeFbUid, string managerFbUid)
    {
        const string sql = """
            DELETE FROM Employee_Shift
            WHERE  employee_user_ID  = (SELECT user_ID FROM [User] WHERE FBUID = @employeeFbUid)
              AND  shift_ID IN (
                  SELECT s.Shift_ID
                  FROM   Shift s
                  INNER JOIN Event           e  ON e.event_ID   = s.event_ID
                  INNER JOIN Project         p  ON p.Proj_ID    = e.project_ID
                  INNER JOIN Manager_Project mp ON mp.project_ID = p.Proj_ID
                  INNER JOIN [User]          mu ON mu.user_ID   = mp.manager_user_ID
                  WHERE e.event_ID = @eventId
                    AND mu.FBUID   = @managerFbUid
              )
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@employeeFbUid", employeeFbUid);
        cmd.Parameters.AddWithValue("@eventId",       eventId);
        cmd.Parameters.AddWithValue("@managerFbUid",  managerFbUid);

        await conn.OpenAsync();
        await cmd.ExecuteNonQueryAsync();
    }
```

- [ ] **Step 4: Build to verify**

```bash
cd backend/Teamgle.Api
dotnet build
```

Expected: `Build succeeded. 0 Error(s)`

- [ ] **Step 5: Commit**

```bash
git add backend/Teamgle.Api/Repositories/ProjectRepository.cs
git commit -m "feat: implement GetEventWorkers, UpdateWorkerStatus, DeleteWorkerAssignment SQL"
```

---

## Task 5: Service layer

**Files:**
- Modify: `backend/Teamgle.Api/Services/IProjectService.cs`
- Modify: `backend/Teamgle.Api/Services/ProjectService.cs`

- [ ] **Step 1: Add to IProjectService.cs after the `SendOfferToEmployeeAsync` line**

```csharp
    // ── Event Workers (Staffing) ───────────────────────────────────────────
    Task<EventWorkersResponse> GetEventWorkersAsync(string firebaseUid, string eventId);
    Task UpdateWorkerStatusAsync(string firebaseUid, string eventId, string employeeFbUid, string newStatus);
    Task DeleteWorkerAssignmentAsync(string firebaseUid, string eventId, string employeeFbUid);
```

- [ ] **Step 2: Add to ProjectService.cs at the bottom (before closing `}`)**

```csharp
    // ── Event Workers (Staffing) ──────────────────────────────────────────
    public async Task<EventWorkersResponse> GetEventWorkersAsync(string firebaseUid, string eventId)
    {
        await ResolveCompanyIdAsync(firebaseUid); // ensures caller is a manager
        return await _projectRepo.GetEventWorkersAsync(eventId, firebaseUid);
    }

    public async Task UpdateWorkerStatusAsync(
        string firebaseUid, string eventId, string employeeFbUid, string newStatus)
    {
        var allowed = new HashSet<string>
        {
            "manager_approved", "manager_hold",
            "manager_reject",   "manager_approved_canceled"
        };
        if (!allowed.Contains(newStatus))
            throw new ArgumentException($"Invalid status: {newStatus}");

        await ResolveCompanyIdAsync(firebaseUid);
        await _projectRepo.UpdateWorkerStatusAsync(eventId, employeeFbUid, newStatus, firebaseUid);
    }

    public async Task DeleteWorkerAssignmentAsync(
        string firebaseUid, string eventId, string employeeFbUid)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        await _projectRepo.DeleteWorkerAssignmentAsync(eventId, employeeFbUid, firebaseUid);
    }
```

- [ ] **Step 3: Build**

```bash
cd backend/Teamgle.Api
dotnet build
```

Expected: `Build succeeded. 0 Error(s)`

- [ ] **Step 4: Commit**

```bash
git add backend/Teamgle.Api/Services/IProjectService.cs \
        backend/Teamgle.Api/Services/ProjectService.cs
git commit -m "feat: add event worker service methods"
```

---

## Task 6: Controller endpoints

**Files:**
- Modify: `backend/Teamgle.Api/Controllers/ShiftsController.cs`

Add 3 endpoints inside the `ShiftsController` class, after the existing `RespondToOffer` method.

- [ ] **Step 1: Add GET /api/events/{eventId}/workers**

```csharp
    // ── GET /api/events/{eventId}/workers ──────────────────────────────────
    [HttpGet]
    [Route("~/api/events/{eventId}/workers")]
    public async Task<IActionResult> GetEventWorkers(string eventId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            var workers = await _projectService.GetEventWorkersAsync(uid, eventId);
            return Ok(workers);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching workers for event {EventId}", eventId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }
```

- [ ] **Step 2: Add PATCH /api/events/{eventId}/workers/{employeeFbUid}**

```csharp
    // ── PATCH /api/events/{eventId}/workers/{employeeFbUid} ───────────────
    [HttpPatch]
    [Route("~/api/events/{eventId}/workers/{employeeFbUid}")]
    public async Task<IActionResult> UpdateWorkerStatus(
        string eventId, string employeeFbUid, [FromBody] UpdateWorkerStatusRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            await _projectService.UpdateWorkerStatusAsync(uid, eventId, employeeFbUid, request.Status);
            return Ok(new { message = "Status updated." });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating worker status");
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }
```

- [ ] **Step 3: Add DELETE /api/events/{eventId}/workers/{employeeFbUid}**

```csharp
    // ── DELETE /api/events/{eventId}/workers/{employeeFbUid} ──────────────
    [HttpDelete]
    [Route("~/api/events/{eventId}/workers/{employeeFbUid}")]
    public async Task<IActionResult> DeleteWorkerAssignment(string eventId, string employeeFbUid)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            await _projectService.DeleteWorkerAssignmentAsync(uid, eventId, employeeFbUid);
            return Ok(new { message = "Assignment removed." });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting worker assignment");
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }
```

- [ ] **Step 4: Build and run**

```bash
cd backend/Teamgle.Api
dotnet build
dotnet run
```

Expected: `Now listening on: http://localhost:5000`

- [ ] **Step 5: Smoke-test endpoints**

With backend running, open a project with events in the browser. Open DevTools → Network. Navigate to the Employees tab of a project. Manually call:

```
GET http://localhost:5000/api/events/{a-real-event-id}/workers
Authorization: Bearer {token from sessionStorage}
```

Expected: `{ "applicants": [], "approved": [], "hold": [], "rejected": [] }` (empty if no Employee_Shift rows yet, or populated if some exist).

- [ ] **Step 6: Commit**

```bash
git add backend/Teamgle.Api/Controllers/ShiftsController.cs
git commit -m "feat: add GET/PATCH/DELETE event workers endpoints"
```

---

## Task 7: Frontend — row renderer and section updater

**Files:**
- Modify: `frontend/js/manager-dashboard.js`

- [ ] **Step 1: Replace `_buildWorkerRow` with a version that accepts API data**

Find the existing `_buildWorkerRow` function (around line 4720) and replace it entirely:

```js
function _buildWorkerRow(worker, sectionType) {
  const initials = (worker.firstName[0] ?? "") + (worker.lastName[0] ?? "");
  const name     = `${worker.firstName} ${worker.lastName}`;

  let btns = "";
  if (sectionType === "applicant" || sectionType === "hold")
    btns += `<button class="ps-action-btn ps-action-btn--approve" data-action="approve" title="Approve"><i data-lucide="check"></i></button>`;
  if (sectionType === "applicant" || sectionType === "approved")
    btns += `<button class="ps-action-btn ps-action-btn--hold" data-action="hold" title="Hold"><i data-lucide="pause"></i></button>`;
  if (sectionType !== "rejected")
    btns += `<button class="ps-action-btn ps-action-btn--reject" data-action="reject" title="Reject"><i data-lucide="x"></i></button>`;
  if (sectionType === "rejected")
    btns += `<button class="ps-send-btn ps-send-btn--return" data-action="return-to-pool" title="Move to Potential"><i data-lucide="users"></i> Return to Pool</button>`;
  btns += `<button class="ps-action-btn ps-action-btn--msg" data-action="message" title="Message"><i data-lucide="message-circle"></i></button>`;

  return `
    <tr class="ps-row"
        data-worker-fbuid="${escapeHtml(worker.fbUid)}"
        data-worker-status="${escapeHtml(worker.status)}"
        data-shift-id="${escapeHtml(worker.shiftId)}">
      <td><div class="ps-cell-worker">
        <div class="ps-avatar">${escapeHtml(initials.toUpperCase())}</div>
        <div>
          <div class="ps-worker-name">${escapeHtml(name)}</div>
          <div class="ps-worker-meta">${escapeHtml(worker.roleName)}</div>
        </div>
      </div></td>
      <td><span class="ps-shift-badge">${escapeHtml(worker.shiftId.slice(0, 8))}</span></td>
      <td><span class="ps-role-chip">${escapeHtml(worker.roleName)}</span></td>
      <td class="ps-cost">—</td>
      <td><div class="ps-actions-cell">${btns}</div></td>
    </tr>`;
}
```

- [ ] **Step 2: Add `_renderEventWorkerSection` helper**

Add this new function directly after `_buildWorkerRow`:

```js
function _renderEventWorkerSection(eventId, key, workers, sectionType) {
  const body  = document.getElementById(`ps-body-${eventId}-${key}`);
  const badge = document.querySelector(`#ps-section-${eventId}-${key} .ps-badge`);
  if (!body) return;

  const rows = workers.length === 0
    ? `<tr><td colspan="5" class="ps-empty">No workers in this category yet.</td></tr>`
    : workers.map(w => _buildWorkerRow(w, sectionType)).join("");

  body.querySelector("tbody").innerHTML = rows;
  if (badge) badge.textContent = workers.length;
  if (window.lucide) lucide.createIcons();
}
```

- [ ] **Step 3: Add `loadAndRenderEventWorkers` function**

Add this function after `_renderEventWorkerSection`:

```js
async function loadAndRenderEventWorkers(eventId) {
  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/events/${encodeURIComponent(eventId)}/workers`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error("Failed to load event workers");
    const data = await res.json();

    _renderEventWorkerSection(eventId, "applicants", data.applicants, "applicant");
    _renderEventWorkerSection(eventId, "approved",   data.approved,   "approved");
    _renderEventWorkerSection(eventId, "hold",       data.hold,       "hold");
    _renderEventWorkerSection(eventId, "rejected",   data.rejected,   "rejected");
  } catch (err) {
    console.error("[Staffing] Failed to load event workers:", err);
  }
}
```

- [ ] **Step 4: Call `loadAndRenderEventWorkers` when the Employees tab renders**

Find the existing block (around line 4622):

```js
  // Fetch potential workers for each real event in background
  const events = currentProjectDetail?.events ?? [];
  events.forEach(ev => {
    if (currentProjectId) loadAndRenderPotentialWorkers(currentProjectId, ev.eventId);
```

Add the new call right below `loadAndRenderPotentialWorkers`:

```js
  const events = currentProjectDetail?.events ?? [];
  events.forEach(ev => {
    if (currentProjectId) loadAndRenderPotentialWorkers(currentProjectId, ev.eventId);
    loadAndRenderEventWorkers(ev.eventId);
  });
```

- [ ] **Step 5: Commit**

```bash
git add frontend/js/manager-dashboard.js
git commit -m "feat: load assigned workers into staffing sections from API"
```

---

## Task 8: Frontend — polling

**Files:**
- Modify: `frontend/js/manager-dashboard.js`

- [ ] **Step 1: Add polling state variables near the top of state declarations**

Find the state block (around line 90):
```js
let currentIdToken = null;
let currentFirebaseUid = null;
let profile = null;
let allEmployees = [];
let allCustomers = [];
let chatInitialized = false;
```

Add after `chatInitialized`:
```js
let _staffingPollInterval = null;
```

- [ ] **Step 2: Add `_startStaffingPoll` and `_stopStaffingPoll` functions**

Add these two functions near the other staffing helpers (after `loadAndRenderEventWorkers`):

```js
function _startStaffingPoll() {
  _stopStaffingPoll(); // clear any existing interval
  const events = currentProjectDetail?.events ?? [];
  _staffingPollInterval = setInterval(() => {
    events.forEach(ev => loadAndRenderEventWorkers(ev.eventId));
  }, 15000);
}

function _stopStaffingPoll() {
  if (_staffingPollInterval !== null) {
    clearInterval(_staffingPollInterval);
    _staffingPollInterval = null;
  }
}
```

- [ ] **Step 3: Start poll when Employees tab opens, stop when leaving**

Find the section-switching logic in the project detail view. Look for where `"employees"` section is shown — the `showProjectSection` function or nav click handlers. Specifically find where the staffing section is activated (where `_initStaffingHandlers()` is called) and add `_startStaffingPoll()` right after it:

```js
  _initStaffingHandlers();
  _startStaffingPoll();   // ← add this line
```

Find where `currentProjectId` is cleared or where the project panel is closed. Add `_stopStaffingPoll()` there. Search for `currentProjectId = null` or `closeProjectDetail` and add the stop call:

```js
  _stopStaffingPoll();   // ← add before or after clearing project state
```

- [ ] **Step 4: Commit**

```bash
git add frontend/js/manager-dashboard.js
git commit -m "feat: add 15s polling for staffing sections"
```

---

## Task 9: Frontend — action buttons (Approve / Hold / Reject / Return to Pool)

**Files:**
- Modify: `frontend/js/manager-dashboard.js`

- [ ] **Step 1: Replace the action button stub in `_initStaffingHandlers`**

Find inside `_initStaffingHandlers` (around line 4988):

```js
  // Action buttons
  document.querySelectorAll(".ps-root .ps-action-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const workerId = btn.closest(".ps-row")?.dataset.workerId;
      if (action === "message") {
        console.log(`[Staffing] Open chat with worker #${workerId}`);
      } else {
        console.log(`[Staffing] Action "${action}" on worker #${workerId}`);
      }
    });
  });

  // Return-to-pool buttons (non-potential sections)
  document.querySelectorAll(".ps-root .ps-send-btn--return").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      btn.innerHTML = `<i data-lucide="check"></i> Moved`;
      btn.disabled = true;
      btn.classList.add("ps-send-btn--sent");
      if (window.lucide) lucide.createIcons();
    });
  });
```

Replace both blocks with a single event-delegated handler on `.ps-root`:

```js
  // Action buttons — event delegation so handlers survive re-renders
  const psRoot = document.querySelector(".ps-root");
  if (psRoot) {
    psRoot.addEventListener("click", async e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;

      // Skip potential-worker buttons (handled separately)
      if (btn.classList.contains("ps-btn--send-worker")) return;

      e.stopPropagation();

      const action = btn.dataset.action;
      const row    = btn.closest(".ps-row");
      if (!row) return;

      const fbUid   = row.dataset.workerFbuid;
      const section = row.closest(".ps-section");
      const eventId = section?.id.match(/ps-section-(.+?)-(applicants|approved|hold|rejected)/)?.[1];

      if (action === "message") {
        console.log(`[Staffing] Open chat with ${fbUid}`);
        return;
      }

      if (!fbUid || !eventId) return;

      if (action === "return-to-pool") {
        await _handleReturnToPool(eventId, fbUid, btn);
        return;
      }

      const statusMap = {
        approve: row.dataset.workerStatus === "manager_approved" ? "manager_approved" : "manager_approved",
        hold:    "manager_hold",
        reject:  row.dataset.workerStatus === "manager_approved" ? "manager_approved_canceled" : "manager_reject",
      };
      const newStatus = statusMap[action];
      if (!newStatus) return;

      await _handleWorkerStatusChange(eventId, fbUid, newStatus, btn, row);
    });
  }
```

- [ ] **Step 2: Add `_handleWorkerStatusChange` function**

Add after `_stopStaffingPoll`:

```js
async function _handleWorkerStatusChange(eventId, fbUid, newStatus, btn, row) {
  // Optimistic: disable button
  btn.disabled = true;
  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/events/${encodeURIComponent(eventId)}/workers/${encodeURIComponent(fbUid)}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      }
    );
    if (!res.ok) throw new Error("Failed to update status");

    // Immediately re-load this event's workers to reflect the move
    await loadAndRenderEventWorkers(eventId);
  } catch {
    btn.disabled = false;
    alert("Failed to update worker status. Please try again.");
  }
}
```

- [ ] **Step 3: Add `_handleReturnToPool` function**

Add after `_handleWorkerStatusChange`:

```js
async function _handleReturnToPool(eventId, fbUid, btn) {
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="ps-spin"></i>`;
  if (window.lucide) lucide.createIcons();

  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/events/${encodeURIComponent(eventId)}/workers/${encodeURIComponent(fbUid)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok) throw new Error("Failed to remove assignment");

    // Reload both workers sections and potential workers
    await loadAndRenderEventWorkers(eventId);
    if (currentProjectId) await loadAndRenderPotentialWorkers(currentProjectId, eventId);
  } catch {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="users"></i> Return to Pool`;
    if (window.lucide) lucide.createIcons();
    alert("Failed to return worker to pool. Please try again.");
  }
}
```

- [ ] **Step 4: Verify flow end-to-end**

1. Start backend: `cd backend/Teamgle.Api && dotnet run`
2. Open frontend via Live Server → log in as manager
3. Open a project with events
4. Go to Employees tab
5. In Potential Workers, send an offer to a worker
6. Log in as that employee in another browser tab → Job Offers → Accept
7. Return to manager tab → within 15s the worker should appear in **Shift Applicants**
8. Click Approve → worker moves to **Approved Workers**
9. Click Hold on another applicant → moves to **Hold/Standby**
10. Click Reject on an approved worker → moves to **Rejected** (status `manager_approved_canceled`)
11. Click Return to Pool on a rejected worker → disappears from Rejected, reappears in Potential Workers

- [ ] **Step 5: Commit**

```bash
git add frontend/js/manager-dashboard.js
git commit -m "feat: wire approve/hold/reject/return-to-pool staffing actions"
```

---

## Task 10: Final cleanup and branch push

- [ ] **Step 1: Run full build one more time**

```bash
cd backend/Teamgle.Api
dotnet build
```

Expected: `Build succeeded. 0 Error(s)`

- [ ] **Step 2: Push branch**

```bash
git push -u origin feature/staffing-full-logic
```
