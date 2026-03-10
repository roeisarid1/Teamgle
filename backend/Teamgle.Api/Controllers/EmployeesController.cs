using FirebaseAdmin.Auth;
using Microsoft.AspNetCore.Mvc;
using Teamgle.Api.Models.DTOs;
using Teamgle.Api.Services;

namespace Teamgle.Api.Controllers;

[ApiController]
[Route("api/employees")]
public class EmployeesController : ControllerBase
{
    private readonly IEmployeeService _employeeService;
    private readonly ILogger<EmployeesController> _logger;

    public EmployeesController(IEmployeeService employeeService, ILogger<EmployeesController> logger)
    {
        _employeeService = employeeService;
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

    // ── GET /api/employees ─────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetEmployees()
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            var employees = await _employeeService.GetEmployeesForManagerAsync(uid);
            return Ok(employees);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching employees");
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── POST /api/employees/create ─────────────────────────────────────────
    [HttpPost("create")]
    public async Task<IActionResult> CreateEmployee([FromBody] CreateEmployeeRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            var employeeId = await _employeeService.CreateEmployeeAsync(uid, request);
            return Ok(new { message = "Employee created successfully.", employeeId });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating employee");
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── GET /api/employees/{id} ────────────────────────────────────────────
    [HttpGet("{id}")]
    public async Task<IActionResult> GetEmployee(string id)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            var employee = await _employeeService.GetEmployeeByIdAsync(uid, id);
            return Ok(employee);
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
            _logger.LogError(ex, "Error fetching employee {Id}", id);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── PUT /api/employees/{id} ────────────────────────────────────────────
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateEmployee(string id, [FromBody] UpdateEmployeeRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            await _employeeService.UpdateEmployeeAsync(uid, id, request);
            return Ok(new { message = "Employee updated successfully." });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating employee {Id}", id);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── DELETE /api/employees/{id} ─────────────────────────────────────────
    // NOTE: Firebase Storage cleanup is handled client-side before this call.
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteEmployee(string id)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            await _employeeService.DeleteEmployeeAsync(uid, id);
            return Ok(new { message = "Employee deleted successfully." });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting employee {Id}", id);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }
}
