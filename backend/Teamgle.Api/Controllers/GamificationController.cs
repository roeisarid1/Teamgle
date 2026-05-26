using FirebaseAdmin.Auth;
using Microsoft.AspNetCore.Mvc;
using Teamgle.Api.Services;

namespace Teamgle.Api.Controllers;

[ApiController]
[Route("api/gamification")]
public class GamificationController : ControllerBase
{
    private readonly IGamificationService _service;
    private readonly ILogger<GamificationController> _logger;

    public GamificationController(IGamificationService service, ILogger<GamificationController> logger)
    {
        _service = service;
        _logger  = logger;
    }

    private async Task<string?> GetFirebaseUidAsync()
    {
        var authHeader = Request.Headers["Authorization"].FirstOrDefault();
        if (authHeader == null || !authHeader.StartsWith("Bearer ")) return null;
        var idToken = authHeader["Bearer ".Length..].Trim();
        try
        {
            var decoded = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken);
            return decoded.Uid;
        }
        catch { return null; }
    }

    // GET /api/gamification/shift-champions?period=current_month
    [HttpGet("shift-champions")]
    public async Task<IActionResult> GetShiftChampions([FromQuery] string period = "current_month")
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            var result = await _service.GetShiftChampionsAsync(uid, period);
            if (result == null)
                return Unauthorized(new { error = "User not found." });
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching shift champions");
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }
}
