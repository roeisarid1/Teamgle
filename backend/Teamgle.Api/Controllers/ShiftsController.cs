using FirebaseAdmin.Auth;
using Microsoft.AspNetCore.Mvc;
using Teamgle.Api.Models.DTOs;
using Teamgle.Api.Services;

namespace Teamgle.Api.Controllers;

[ApiController]
[Route("api/shifts")]
public class ShiftsController : ControllerBase
{
    private readonly IProjectService _projectService;
    private readonly ILogger<ShiftsController> _logger;

    public ShiftsController(IProjectService projectService, ILogger<ShiftsController> logger)
    {
        _projectService = projectService;
        _logger         = logger;
    }

    // ── Helper: extract and verify Firebase token from Authorization header ─
    private async Task<string?> GetFirebaseUidAsync()
    {
        var authHeader = Request.Headers["Authorization"].FirstOrDefault();
        if (authHeader == null || !authHeader.StartsWith("Bearer "))
            return null;

        var idToken = authHeader["Bearer ".Length..].Trim();
        try
        {
            var decoded = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken);
            return decoded.Uid;
        }
        catch
        {
            return null;
        }
    }

    // ── POST /api/events/{eventId}/shifts ─────────────────────────────────
    [HttpPost]
    [Route("~/api/events/{eventId}/shifts")]
    public async Task<IActionResult> CreateShift(string eventId, [FromBody] CreateShiftRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            await _projectService.CreateEventShiftAsync(uid, eventId, request);
            return Ok(new { message = "Shift created successfully." });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating shift for event {EventId}", eventId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── PATCH /api/shifts/{shiftId} ────────────────────────────────────────
    [HttpPatch("{shiftId}")]
    public async Task<IActionResult> UpdateShift(string shiftId, [FromBody] UpdateShiftRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            await _projectService.UpdateShiftAsync(uid, shiftId, request);
            return Ok(new { message = "Shift updated successfully." });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating shift {ShiftId}", shiftId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── DELETE /api/shifts/{shiftId} ───────────────────────────────────────
    [HttpDelete("{shiftId}")]
    public async Task<IActionResult> DeleteShift(string shiftId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            await _projectService.DeleteShiftAsync(uid, shiftId);
            return Ok(new { message = "Shift deleted successfully." });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting shift {ShiftId}", shiftId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── GET /api/shifts/my-offers ──────────────────────────────────────────
    [HttpGet("my-offers")]
    public async Task<IActionResult> GetMyOffers()
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            var offers = await _projectService.GetMyJobOffersAsync(uid);
            return Ok(offers);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching job offers for employee");
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── PUT /api/shifts/{shiftId}/respond ──────────────────────────────────
    [HttpPut("{shiftId}/respond")]
    public async Task<IActionResult> RespondToOffer(string shiftId, [FromBody] RespondToOfferRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            await _projectService.RespondToJobOfferAsync(uid, shiftId, request.Accept);
            var message = request.Accept ? "Shift accepted." : "Shift declined.";
            return Ok(new { message });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error responding to job offer for shift {ShiftId}", shiftId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── PUT /api/shifts/{shiftId}/bulk-hours ─────────────────────────────
    [HttpPut("{shiftId}/bulk-hours")]
    public async Task<IActionResult> SetBulkHours(string shiftId, [FromBody] BulkShiftHoursRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var ok = await _projectService.SetShiftBulkHoursAsync(uid, shiftId, request);
            if (!ok) return NotFound(new { error = "Shift not found or access denied." });
            return Ok(new { message = "Bulk hours saved." });
        }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error setting bulk hours for shift {ShiftId}", shiftId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── PATCH /api/shifts/{shiftId}/report-hours ──────────────────────────
    [HttpPatch("{shiftId}/report-hours")]
    public async Task<IActionResult> ReportHours(string shiftId, [FromBody] ReportHoursRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            var updated = await _projectService.ReportHoursAsync(uid, shiftId, request.ActualStart, request.ActualEnd);
            if (!updated) return NotFound(new { error = "Shift not found or not approved." });
            return Ok(new { message = "Hours reported." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reporting hours for shift {ShiftId}", shiftId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── GET /api/shifts/my-applications ───────────────────────────────────
    [HttpGet("my-applications")]
    public async Task<IActionResult> GetMyApplications()
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            var applications = await _projectService.GetMyApplicationsAsync(uid);
            return Ok(applications);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching applications for employee");
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

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

    // ── PATCH /api/events/{eventId}/workers/{employeeFbUid} ───────────────
    [HttpPatch]
    [Route("~/api/events/{eventId}/workers/{employeeFbUid}")]
    public async Task<IActionResult> UpdateWorkerStatus(
        string eventId, string employeeFbUid, [FromBody] UpdateWorkerStatusRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        if (string.IsNullOrWhiteSpace(request.ShiftId))
            return BadRequest(new { error = "ShiftId is required." });

        try
        {
            await _projectService.UpdateWorkerStatusAsync(uid, eventId, employeeFbUid, request.ShiftId, request.Status);
            return Ok(new { message = "Status updated." });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating worker status");
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── POST /api/shifts/{shiftId}/auto-assign ────────────────────────────
    [HttpPost("{shiftId}/auto-assign")]
    public async Task<IActionResult> AutoAssign(string shiftId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            var result = await _projectService.AutoAssignShiftAsync(uid, shiftId);
            return Ok(result);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error running auto-assign for shift {ShiftId}", shiftId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── DELETE /api/events/{eventId}/workers/{employeeFbUid} ──────────────
    [HttpDelete]
    [Route("~/api/events/{eventId}/workers/{employeeFbUid}")]
    public async Task<IActionResult> DeleteWorkerAssignment(
        string eventId, string employeeFbUid, [FromQuery] string shiftId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        if (string.IsNullOrWhiteSpace(shiftId))
            return BadRequest(new { error = "shiftId query parameter is required." });

        try
        {
            await _projectService.DeleteWorkerAssignmentAsync(uid, eventId, employeeFbUid, shiftId);
            return Ok(new { message = "Assignment removed." });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting worker assignment");
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }
}
