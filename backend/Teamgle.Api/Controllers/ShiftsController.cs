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

    // ── GET /api/shifts/my-cancellations  (employee: shifts deleted after approval)
    [HttpGet("my-cancellations")]
    public async Task<IActionResult> GetMyCancellations()
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var notices = await _projectService.GetMyCancellationNoticesAsync(uid);
            return Ok(notices);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching cancellation notices for employee");
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

    // ══════════════════════════════════════════════════════════════════════
    //  SHIFT BRIEFS
    // ══════════════════════════════════════════════════════════════════════

    // GET /api/shifts/{shiftId}/briefs
    [HttpGet("{shiftId}/briefs")]
    public async Task<IActionResult> GetShiftBriefs(string shiftId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var briefs = await _projectService.GetShiftBriefsAsync(uid, shiftId);
            if (briefs == null) return NotFound(new { error = "Shift not found." });
            return Ok(briefs);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching briefs for shift {ShiftId}", shiftId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // POST /api/shifts/{shiftId}/briefs
    [HttpPost("{shiftId}/briefs")]
    public async Task<IActionResult> CreateShiftBrief(string shiftId, [FromBody] CreateBriefRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var brief = await _projectService.CreateShiftBriefAsync(uid, shiftId, request);
            if (brief == null) return NotFound(new { error = "Shift not found." });
            return StatusCode(201, brief);
        }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating brief for shift {ShiftId}", shiftId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // PUT /api/shifts/{shiftId}/briefs/{briefId}
    [HttpPut("{shiftId}/briefs/{briefId}")]
    public async Task<IActionResult> UpdateShiftBrief(string shiftId, string briefId, [FromBody] UpdateBriefRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var brief = await _projectService.UpdateShiftBriefAsync(uid, shiftId, briefId, request);
            if (brief == null) return NotFound(new { error = "Brief not found." });
            return Ok(brief);
        }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating brief {BriefId}", briefId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // DELETE /api/shifts/{shiftId}/briefs/{briefId}
    [HttpDelete("{shiftId}/briefs/{briefId}")]
    public async Task<IActionResult> DeleteShiftBrief(string shiftId, string briefId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var result = await _projectService.DeleteShiftBriefAsync(uid, shiftId, briefId);
            if (result == null)  return NotFound(new { error = "Shift not found." });
            if (result == false) return NotFound(new { error = "Brief not found." });
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting brief {BriefId}", briefId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // GET /api/shifts/{shiftId}/briefs/{briefId}/acknowledgments
    [HttpGet("{shiftId}/briefs/{briefId}/acknowledgments")]
    public async Task<IActionResult> GetShiftBriefAcknowledgments(string shiftId, string briefId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var acks = await _projectService.GetBriefAcknowledgmentsAsync(uid, briefId);
            if (acks == null) return NotFound(new { error = "Brief not found or access denied." });
            return Ok(acks);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching acknowledgments for brief {BriefId}", briefId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    //  SHIFT EQUIPMENT
    // ══════════════════════════════════════════════════════════════════════

    // GET /api/shifts/{shiftId}/equipment
    [HttpGet("{shiftId}/equipment")]
    public async Task<IActionResult> GetShiftEquipment(string shiftId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var items = await _projectService.GetShiftEquipmentAsync(uid, shiftId);
            if (items == null) return NotFound(new { error = "Shift not found." });
            return Ok(items);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching equipment for shift {ShiftId}", shiftId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // POST /api/shifts/{shiftId}/equipment
    [HttpPost("{shiftId}/equipment")]
    public async Task<IActionResult> CreateShiftEquipment(string shiftId, [FromBody] CreateEquipmentRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var item = await _projectService.CreateShiftEquipmentAsync(uid, shiftId, request);
            if (item == null) return NotFound(new { error = "Shift not found." });
            return StatusCode(201, item);
        }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating equipment for shift {ShiftId}", shiftId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // PUT /api/shifts/{shiftId}/equipment/{equipmentId}
    [HttpPut("{shiftId}/equipment/{equipmentId}")]
    public async Task<IActionResult> UpdateShiftEquipment(string shiftId, string equipmentId, [FromBody] UpdateEquipmentRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var item = await _projectService.UpdateShiftEquipmentAsync(uid, shiftId, equipmentId, request);
            if (item == null) return NotFound(new { error = "Equipment item not found." });
            return Ok(item);
        }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating equipment {EquipmentId}", equipmentId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }

    // DELETE /api/shifts/{shiftId}/equipment/{equipmentId}
    [HttpDelete("{shiftId}/equipment/{equipmentId}")]
    public async Task<IActionResult> DeleteShiftEquipment(string shiftId, string equipmentId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var result = await _projectService.DeleteShiftEquipmentAsync(uid, shiftId, equipmentId);
            if (result == null)  return NotFound(new { error = "Shift not found." });
            if (result == false) return NotFound(new { error = "Equipment item not found." });
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting equipment {EquipmentId}", equipmentId);
            return StatusCode(500, new { error = "Unexpected error." });
        }
    }
}
