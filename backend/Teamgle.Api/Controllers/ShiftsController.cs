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
        _logger = logger;
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
}
