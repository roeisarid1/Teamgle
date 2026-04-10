using FirebaseAdmin.Auth;
using Microsoft.AspNetCore.Mvc;
using Teamgle.Api.Models.DTOs;
using Teamgle.Api.Services;

namespace Teamgle.Api.Controllers;

[ApiController]
[Route("api/events")]
public class EventsController : ControllerBase
{
    private readonly IProjectService _projectService;
    private readonly ILogger<EventsController> _logger;

    public EventsController(IProjectService projectService, ILogger<EventsController> logger)
    {
        _projectService = projectService;
        _logger = logger;
    }

    private async Task<string?> GetFirebaseUidAsync()
    {
        var authHeader = Request.Headers["Authorization"].FirstOrDefault();
        if (authHeader == null || !authHeader.StartsWith("Bearer ")) return null;
        var idToken = authHeader["Bearer ".Length..].Trim();
        try { var decoded = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken); return decoded.Uid; }
        catch { return null; }
    }

    // ══════════════════════════════════════════════════════════════════════
    //  EVENT TASKS
    // ══════════════════════════════════════════════════════════════════════

    // GET /api/events/{eventId}/tasks
    [HttpGet("{eventId}/tasks")]
    public async Task<IActionResult> GetEventTasks(string eventId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var tasks = await _projectService.GetEventTasksAsync(uid, eventId);
            if (tasks == null) return NotFound(new { error = "Event not found." });
            return Ok(tasks);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching tasks for event {EventId}", eventId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // POST /api/events/{eventId}/tasks
    [HttpPost("{eventId}/tasks")]
    public async Task<IActionResult> CreateEventTask(string eventId, [FromBody] CreateTaskRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var task = await _projectService.CreateEventTaskAsync(uid, eventId, request);
            if (task == null) return NotFound(new { error = "Event not found." });
            return StatusCode(201, task);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating task for event {EventId}", eventId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // PUT /api/events/{eventId}/tasks/{taskId}
    [HttpPut("{eventId}/tasks/{taskId}")]
    public async Task<IActionResult> UpdateEventTask(string eventId, string taskId, [FromBody] UpdateTaskRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var task = await _projectService.UpdateEventTaskAsync(uid, eventId, taskId, request);
            if (task == null) return NotFound(new { error = "Task not found." });
            return Ok(task);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating task {TaskId}", taskId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // DELETE /api/events/{eventId}/tasks/{taskId}
    [HttpDelete("{eventId}/tasks/{taskId}")]
    public async Task<IActionResult> DeleteEventTask(string eventId, string taskId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var result = await _projectService.DeleteEventTaskAsync(uid, eventId, taskId);
            if (result == null)  return NotFound(new { error = "Event not found." });
            if (result == false) return NotFound(new { error = "Task not found." });
            return NoContent();
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting task {TaskId}", taskId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    //  EVENT BRIEFS
    // ══════════════════════════════════════════════════════════════════════

    // GET /api/events/{eventId}/briefs
    [HttpGet("{eventId}/briefs")]
    public async Task<IActionResult> GetEventBriefs(string eventId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var briefs = await _projectService.GetEventBriefsAsync(uid, eventId);
            if (briefs == null) return NotFound(new { error = "Event not found." });
            return Ok(briefs);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching briefs for event {EventId}", eventId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // POST /api/events/{eventId}/briefs
    [HttpPost("{eventId}/briefs")]
    public async Task<IActionResult> CreateEventBrief(string eventId, [FromBody] CreateBriefRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var brief = await _projectService.CreateEventBriefAsync(uid, eventId, request);
            if (brief == null) return NotFound(new { error = "Event not found." });
            return StatusCode(201, brief);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating brief for event {EventId}", eventId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // PUT /api/events/{eventId}/briefs/{briefId}
    [HttpPut("{eventId}/briefs/{briefId}")]
    public async Task<IActionResult> UpdateEventBrief(string eventId, string briefId, [FromBody] UpdateBriefRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var brief = await _projectService.UpdateEventBriefAsync(uid, eventId, briefId, request);
            if (brief == null) return NotFound(new { error = "Brief not found." });
            return Ok(brief);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating brief {BriefId}", briefId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // DELETE /api/events/{eventId}/briefs/{briefId}
    [HttpDelete("{eventId}/briefs/{briefId}")]
    public async Task<IActionResult> DeleteEventBrief(string eventId, string briefId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var result = await _projectService.DeleteEventBriefAsync(uid, eventId, briefId);
            if (result == null)  return NotFound(new { error = "Event not found." });
            if (result == false) return NotFound(new { error = "Brief not found." });
            return NoContent();
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting brief {BriefId}", briefId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // GET /api/events/{eventId}/briefs/{briefId}/acknowledgments
    [HttpGet("{eventId}/briefs/{briefId}/acknowledgments")]
    public async Task<IActionResult> GetBriefAcknowledgments(string eventId, string briefId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var acks = await _projectService.GetBriefAcknowledgmentsAsync(uid, briefId);
            if (acks == null) return NotFound(new { error = "Brief not found or access denied." });
            return Ok(acks);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching acknowledgments for brief {BriefId}", briefId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    //  EVENT EXPENSES
    // ══════════════════════════════════════════════════════════════════════

    // GET /api/events/{eventId}/expenses
    [HttpGet("{eventId}/expenses")]
    public async Task<IActionResult> GetEventExpenses(string eventId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var expenses = await _projectService.GetEventExpensesAsync(uid, eventId);
            if (expenses == null) return NotFound(new { error = "Event not found." });
            return Ok(expenses);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching expenses for event {EventId}", eventId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // POST /api/events/{eventId}/expenses
    [HttpPost("{eventId}/expenses")]
    public async Task<IActionResult> CreateEventExpense(string eventId, [FromBody] CreateExpenseRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var expense = await _projectService.CreateEventExpenseAsync(uid, eventId, request);
            if (expense == null) return NotFound(new { error = "Event not found." });
            return StatusCode(201, expense);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating expense for event {EventId}", eventId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // PUT /api/events/{eventId}/expenses/{expenseId}
    [HttpPut("{eventId}/expenses/{expenseId}")]
    public async Task<IActionResult> UpdateEventExpense(string eventId, string expenseId, [FromBody] UpdateExpenseRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var expense = await _projectService.UpdateEventExpenseAsync(uid, eventId, expenseId, request);
            if (expense == null) return NotFound(new { error = "Expense not found." });
            return Ok(expense);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating expense {ExpenseId}", expenseId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // DELETE /api/events/{eventId}/expenses/{expenseId}
    [HttpDelete("{eventId}/expenses/{expenseId}")]
    public async Task<IActionResult> DeleteEventExpense(string eventId, string expenseId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var result = await _projectService.DeleteEventExpenseAsync(uid, eventId, expenseId);
            if (result == null)  return NotFound(new { error = "Event not found." });
            if (result == false) return NotFound(new { error = "Expense not found." });
            return NoContent();
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting expense {ExpenseId}", expenseId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    //  EVENT PAYROLL
    // ══════════════════════════════════════════════════════════════════════

    // GET /api/events/{eventId}/payroll
    [HttpGet("{eventId}/payroll")]
    public async Task<IActionResult> GetEventPayroll(string eventId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var payroll = await _projectService.GetEventPayrollAsync(uid, eventId);
            if (payroll == null) return NotFound(new { error = "Event not found." });
            return Ok(payroll);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching payroll for event {EventId}", eventId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // PUT /api/events/{eventId}/payroll/{employeeUserId}/{shiftId}/approve
    [HttpPut("{eventId}/payroll/{employeeUserId}/{shiftId}/approve")]
    public async Task<IActionResult> ApproveHours(string eventId, string employeeUserId, string shiftId, [FromBody] ApproveHoursRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var item = await _projectService.ApproveHoursAsync(uid, eventId, shiftId, employeeUserId, request);
            if (item == null) return NotFound(new { error = "Record not found." });
            return Ok(item);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error approving hours for employee {EmployeeUserId} shift {ShiftId}", employeeUserId, shiftId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // PUT /api/events/{eventId}/payroll/{employeeUserId}/{shiftId}/save
    [HttpPut("{eventId}/payroll/{employeeUserId}/{shiftId}/save")]
    public async Task<IActionResult> SavePayroll(string eventId, string employeeUserId, string shiftId, [FromBody] SavePayrollRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var item = await _projectService.SavePayrollAsync(uid, eventId, shiftId, employeeUserId, request);
            if (item == null) return NotFound(new { error = "Record not found." });
            return Ok(item);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error saving payroll for employee {EmployeeUserId} shift {ShiftId}", employeeUserId, shiftId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // PUT /api/events/{eventId}/payroll/{employeeUserId}/{shiftId}  (kept for compat)
    [HttpPut("{eventId}/payroll/{employeeUserId}/{shiftId}")]
    public async Task<IActionResult> UpdatePayroll(string eventId, string employeeUserId, string shiftId, [FromBody] UpdatePayrollRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var item = await _projectService.UpdatePayrollAsync(uid, eventId, shiftId, employeeUserId, request);
            if (item == null) return NotFound(new { error = "Record not found." });
            return Ok(item);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating payroll for employee {EmployeeUserId} shift {ShiftId}", employeeUserId, shiftId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    //  BRIEF ACKNOWLEDGMENT (Employee route)
    // ══════════════════════════════════════════════════════════════════════

    // GET /api/events/my-briefs  (employee: get all relevant briefs)
    [HttpGet("my-briefs")]
    public async Task<IActionResult> GetMyBriefs()
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var briefs = await _projectService.GetMyBriefsAsync(uid);
            return Ok(briefs ?? []);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching briefs for employee");
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // POST /api/events/briefs/{briefId}/acknowledge
    [HttpPost("briefs/{briefId}/acknowledge")]
    public async Task<IActionResult> AcknowledgeBrief(string briefId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var ok = await _projectService.AcknowledgeBriefAsync(uid, briefId);
            if (!ok) return NotFound(new { error = "Employee not found." });
            return Ok(new { message = "Brief acknowledged." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error acknowledging brief {BriefId}", briefId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }
}
