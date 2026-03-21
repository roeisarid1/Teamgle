using FirebaseAdmin.Auth;
using Microsoft.AspNetCore.Mvc;
using Teamgle.Api.Services;

namespace Teamgle.Api.Controllers;

[ApiController]
[Route("api/tasks")]
public class TasksController : ControllerBase
{
    private readonly ITaskService _taskService;
    private readonly ILogger<TasksController> _logger;

    public TasksController(ITaskService taskService, ILogger<TasksController> logger)
    {
        _taskService = taskService;
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

    // ── GET /api/tasks ─────────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetTasks()
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            var tasks = await _taskService.GetTasksAsync(uid);
            return Ok(tasks);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load tasks for uid={Uid}", uid);
            return StatusCode(500, new { error = "Failed to load tasks." });
        }
    }
}
