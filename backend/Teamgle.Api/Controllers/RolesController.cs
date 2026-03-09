using FirebaseAdmin.Auth;
using Microsoft.AspNetCore.Mvc;
using Teamgle.Api.Services;

namespace Teamgle.Api.Controllers;

[ApiController]
[Route("api/roles")]
public class RolesController : ControllerBase
{
    private readonly IEmployeeService _employeeService;
    private readonly ILogger<RolesController> _logger;

    public RolesController(IEmployeeService employeeService, ILogger<RolesController> logger)
    {
        _employeeService = employeeService;
        _logger = logger;
    }

    private async Task<string?> GetFirebaseUidAsync()
    {
        var authHeader = Request.Headers["Authorization"].FirstOrDefault();
        if (authHeader == null || !authHeader.StartsWith("Bearer ")) return null;
        var idToken = authHeader["Bearer ".Length..].Trim();
        try { return (await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken)).Uid; }
        catch { return null; }
    }

    // GET /api/roles — returns global + company-specific roles
    [HttpGet]
    public async Task<IActionResult> GetRoles()
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            var roles = await _employeeService.GetRolesAsync(uid);
            return Ok(roles);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex) { _logger.LogError(ex, "Error fetching roles"); return StatusCode(500, new { error = "Unexpected error." }); }
    }

    // POST /api/roles — create a new company-specific role
    [HttpPost]
    public async Task<IActionResult> CreateRole([FromBody] CreateRoleRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            await _employeeService.CreateRoleAsync(uid, request.RoleName);
            return Ok(new { message = $"Role '{request.RoleName}' created successfully." });
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex) { return BadRequest(new { error = ex.Message }); }
        catch (InvalidOperationException ex) { return Conflict(new { error = ex.Message }); }
        catch (Exception ex) { _logger.LogError(ex, "Error creating role"); return StatusCode(500, new { error = "Unexpected error." }); }
    }
}

public record CreateRoleRequest(string RoleName);
