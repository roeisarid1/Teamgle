using FirebaseAdmin.Auth;
using Microsoft.AspNetCore.Mvc;
using Teamgle.Api.BL;
using Teamgle.Api.DAL;

namespace Teamgle.Api.Controllers;

[ApiController]
[Route("api/employees")]
public class EmployeesController : ControllerBase
{
    private async Task<string?> GetFirebaseUidAsync()
    {
        var authHeader = Request.Headers["Authorization"].FirstOrDefault();
        if (authHeader == null || !authHeader.StartsWith("Bearer ")) return null;
        string idToken = authHeader["Bearer ".Length..].Trim();
        try { return (await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken)).Uid; }
        catch { return null; }
    }

    // GET /api/employees
    [HttpGet]
    public async Task<IActionResult> GetEmployees()
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });

        EmployeeDAL dal = new EmployeeDAL();

        string? companyId = dal.GetManagerCompanyId(uid);
        if (companyId == null) return StatusCode(403, new { error = "User is not a registered manager." });

        return Ok(dal.GetEmployeesByCompany(companyId));
    }

    // POST /api/employees/create
    [HttpPost("create")]
    public async Task<IActionResult> CreateEmployee([FromBody] Employee emp)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });

        if (string.IsNullOrWhiteSpace(emp.FirstName))  return BadRequest(new { error = "First name is required." });
        if (string.IsNullOrWhiteSpace(emp.LastName))   return BadRequest(new { error = "Last name is required." });
        if (string.IsNullOrWhiteSpace(emp.Email))      return BadRequest(new { error = "Email is required." });
        if (emp.CostPerHour < 0)                       return BadRequest(new { error = "Cost per hour cannot be negative." });
        if (emp.RoleIds == null || emp.RoleIds.Count == 0)
            return BadRequest(new { error = "At least one role must be selected." });

        EmployeeDAL dal = new EmployeeDAL();

        string? companyId = dal.GetManagerCompanyId(uid);
        if (companyId == null) return StatusCode(403, new { error = "User is not a registered manager." });

        if (dal.EmailExists(emp.Email.Trim().ToLower()))
            return Conflict(new { error = "An employee with this email already exists." });

        if (!dal.RoleIdsExist(emp.RoleIds, companyId))
            return BadRequest(new { error = "One or more selected roles are invalid." });

        string employeeId = dal.CreateEmployee(companyId, emp);
        return Ok(new { message = "Employee created successfully.", employeeId });
    }

    // GET /api/employees/{id}
    [HttpGet("{id}")]
    public async Task<IActionResult> GetEmployee(string id)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });

        EmployeeDAL dal = new EmployeeDAL();

        string? companyId = dal.GetManagerCompanyId(uid);
        if (companyId == null) return StatusCode(403, new { error = "User is not a registered manager." });

        Employee? employee = dal.GetEmployeeById(id, companyId);
        if (employee == null) return NotFound(new { error = "Employee not found." });

        return Ok(employee);
    }

    // PUT /api/employees/{id}
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateEmployee(string id, [FromBody] Employee emp)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });

        if (string.IsNullOrWhiteSpace(emp.FirstName))  return BadRequest(new { error = "First name is required." });
        if (string.IsNullOrWhiteSpace(emp.LastName))   return BadRequest(new { error = "Last name is required." });
        if (emp.CostPerHour < 0)                       return BadRequest(new { error = "Cost per hour cannot be negative." });
        if (emp.RoleIds == null || emp.RoleIds.Count == 0)
            return BadRequest(new { error = "At least one role must be selected." });

        EmployeeDAL dal = new EmployeeDAL();

        string? companyId = dal.GetManagerCompanyId(uid);
        if (companyId == null) return StatusCode(403, new { error = "User is not a registered manager." });

        if (!dal.RoleIdsExist(emp.RoleIds, companyId))
            return BadRequest(new { error = "One or more selected roles are invalid." });

        try { dal.UpdateEmployee(id, companyId, emp); }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }

        return Ok(new { message = "Employee updated successfully." });
    }

    // DELETE /api/employees/{id}
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteEmployee(string id)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });

        EmployeeDAL dal = new EmployeeDAL();

        string? companyId = dal.GetManagerCompanyId(uid);
        if (companyId == null) return StatusCode(403, new { error = "User is not a registered manager." });

        try { dal.DeleteEmployee(id, companyId); }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }

        return Ok(new { message = "Employee deleted successfully." });
    }
}
