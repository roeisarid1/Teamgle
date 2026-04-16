using FirebaseAdmin.Auth;
using Microsoft.AspNetCore.Mvc;
using Teamgle.Api.BL;
using Teamgle.Api.DAL;

namespace Teamgle.Api.Controllers;

[ApiController]
[Route("api/roles")]
public class RolesController : ControllerBase
{
    private async Task<string?> GetFirebaseUidAsync()
    {
        var authHeader = Request.Headers["Authorization"].FirstOrDefault();
        if (authHeader == null || !authHeader.StartsWith("Bearer ")) return null;
        string idToken = authHeader["Bearer ".Length..].Trim();
        try { return (await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken)).Uid; }
        catch { return null; }
    }

    // GET /api/roles
    [HttpGet]
    public async Task<IActionResult> GetRoles()
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });

        EmployeeDAL dal = new EmployeeDAL();

        string? companyId = dal.GetManagerCompanyId(uid);
        if (companyId == null) return StatusCode(403, new { error = "User is not a registered manager." });

        return Ok(dal.GetAllRoles(companyId));
    }

    // POST /api/roles
    [HttpPost]
    public async Task<IActionResult> CreateRole([FromBody] Role role)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });

        if (string.IsNullOrWhiteSpace(role.RollName))
            return BadRequest(new { error = "Role name is required." });

        EmployeeDAL dal = new EmployeeDAL();

        string? companyId = dal.GetManagerCompanyId(uid);
        if (companyId == null) return StatusCode(403, new { error = "User is not a registered manager." });

        if (dal.RoleNameExistsForCompany(role.RollName.Trim(), companyId))
            return Conflict(new { error = $"A role named '{role.RollName}' already exists." });

        dal.CreateRole(role.RollName, companyId);
        return Ok(new { message = $"Role '{role.RollName}' created successfully." });
    }
}
