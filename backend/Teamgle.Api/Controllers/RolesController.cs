using Microsoft.AspNetCore.Mvc;
using Teamgle.Api.Services;

namespace Teamgle.Api.Controllers;

[ApiController]
[Route("api/roles")]
public class RolesController : ControllerBase
{
    private readonly IEmployeeService _employeeService;

    public RolesController(IEmployeeService employeeService)
    {
        _employeeService = employeeService;
    }

    // GET /api/roles
    [HttpGet]
    public async Task<IActionResult> GetRoles()
    {
        var roles = await _employeeService.GetRolesAsync();
        return Ok(roles);
    }
}
