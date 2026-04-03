# Staffing Logic — Full Implementation Design
Date: 2026-04-03

## Context

The `employees` branch already has:
- Potential Workers fetch + send offer → `manager_offer_sent`
- Employee Job Offers (accept → `employee_request`, decline → `employee_request_canceled`)
- Staffing UI shell with 4 empty sections (Applicants, Approved, Hold, Rejected)

This spec covers the remaining work: loading those sections from the DB and wiring all manager actions.

## Status Machine (Employee_Shift.status)

```
manager_offer_sent
  → employee accepts  → employee_request       (Shift Applicants)
  → employee declines → employee_request_canceled (hidden)

employee_request
  → manager approves  → manager_approved        (Approved Workers)
  → manager holds     → manager_hold            (Hold/Standby)
  → manager rejects   → manager_reject          (Rejected Workers)

manager_approved
  → manager cancels   → manager_approved_canceled (Rejected Workers)

manager_reject / manager_approved_canceled
  → return to pool    → DELETE row              (back to Potential Workers)
```

## API

### GET /api/events/{eventId}/workers
Returns all assigned workers for the event, grouped by status bucket.

```json
{
  "applicants": [{ "fbUid", "userId", "firstName", "lastName", "roleName", "shiftId", "status" }],
  "approved":   [...],
  "hold":       [...],
  "rejected":   [...]
}
```

Status → bucket mapping:
- `employee_request` → applicants
- `manager_approved` → approved
- `manager_hold` → hold
- `manager_reject`, `manager_approved_canceled` → rejected

### PATCH /api/events/{eventId}/workers/{employeeFbUid}
Body: `{ "status": "manager_approved" | "manager_hold" | "manager_reject" | "manager_approved_canceled" }`

Updates all `Employee_Shift` rows for that employee in that event. Company isolation enforced.

### DELETE /api/events/{eventId}/workers/{employeeFbUid}
Deletes all `Employee_Shift` rows for that employee in that event (return to pool). Company isolation enforced.

## Backend Changes

### New DTO: `EventWorkersResponse`
```csharp
public class EventWorkersResponse {
    public List<AssignedWorkerItem> Applicants { get; set; }
    public List<AssignedWorkerItem> Approved   { get; set; }
    public List<AssignedWorkerItem> Hold       { get; set; }
    public List<AssignedWorkerItem> Rejected   { get; set; }
}
public class AssignedWorkerItem {
    public string ShiftId   { get; set; }
    public string UserId    { get; set; }
    public string FbUid     { get; set; }
    public string FirstName { get; set; }
    public string LastName  { get; set; }
    public string RoleName  { get; set; }
    public string Status    { get; set; }
}
```

### New DTO: `UpdateWorkerStatusRequest`
```csharp
public class UpdateWorkerStatusRequest { public string Status { get; set; } }
```

### IProjectRepository — 3 new methods
```csharp
Task<EventWorkersResponse> GetEventWorkersAsync(string eventId, string firebaseUid);
Task UpdateWorkerStatusAsync(string eventId, string employeeFbUid, string newStatus, string managerFbUid);
Task DeleteWorkerAssignmentAsync(string eventId, string employeeFbUid, string managerFbUid);
```

### ProjectRepository SQL

**GetEventWorkersAsync**: SELECT from `Employee_Shift` JOIN `[User]`, `Shift`, `Roll`, `Event`, `Project`, `Manager_Project` WHERE event_ID = @eventId AND manager's company_ID matches. Filter statuses to only the 4 active buckets.

**UpdateWorkerStatusAsync**: UPDATE `Employee_Shift` SET status = @newStatus WHERE employee_user_ID = (user by fbUid) AND shift_ID IN (shifts of this event) AND company isolation check.

**DeleteWorkerAssignmentAsync**: DELETE FROM `Employee_Shift` WHERE employee_user_ID = ... AND shift_ID IN (shifts of this event) AND company isolation check.

### IProjectService — 3 new methods (delegates to repo)

### ShiftsController — 3 new endpoints
- `GET  ~/api/events/{eventId}/workers`
- `PATCH ~/api/events/{eventId}/workers/{employeeFbUid}`
- `DELETE ~/api/events/{eventId}/workers/{employeeFbUid}`

## Frontend Changes

### loadAndRenderEventWorkers(projectId, eventId)
- Calls `GET /api/events/{eventId}/workers`
- Populates the 4 sections: applicants, approved, hold, rejected
- Replaces existing static empty section content

### Polling
- `setInterval(pollAllEvents, 15000)` — polls all events in the current project
- Starts when Employees tab becomes active, clears on tab change
- On each poll: call `loadAndRenderEventWorkers` for each event, diff and re-render changed rows

### Action Buttons (manager side)
- **Approve**: PATCH `manager_approved` → move row from applicants/hold to approved
- **Hold**: PATCH `manager_hold` → move row from applicants/approved to hold
- **Reject**: PATCH `manager_reject` or `manager_approved_canceled` (depending on current status) → move to rejected
- **Return to Pool**: DELETE → remove row from rejected, reload potential workers for that event

### Optimistic UI
Actions update the UI immediately, then confirm via next poll cycle.

## Not in scope
- Notifications (push/email) when offer is sent or status changes
- Bulk approve/reject
- Pay rate per assignment (already in DB, can be added later)
