using FirebaseAdmin.Auth;
using Microsoft.AspNetCore.Mvc;
using Teamgle.Api.Models.DTOs;
using Teamgle.Api.Services;

namespace Teamgle.Api.Controllers;

[ApiController]
[Route("api/projects")]
public class ProjectsController : ControllerBase
{
    private readonly IProjectService _projectService;
    private readonly ILogger<ProjectsController> _logger;

    public ProjectsController(IProjectService projectService, ILogger<ProjectsController> logger)
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

    // ── GET /api/projects ──────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetProjects()
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            var projects = await _projectService.GetProjectsAsync(uid);
            return Ok(projects);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching projects");
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── GET /api/projects/{id} ─────────────────────────────────────────────
    [HttpGet("{id}")]
    public async Task<IActionResult> GetProject(string id)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            var project = await _projectService.GetProjectByIdAsync(uid, id);
            if (project == null)
                return NotFound(new { error = "Project not found." });

            return Ok(project);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching project {Id}", id);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── GET /api/projects/{id}/schedule ───────────────────────────────────
    [HttpGet("{id}/schedule")]
    public async Task<IActionResult> GetProjectSchedule(string id)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            var schedule = await _projectService.GetProjectScheduleAsync(uid, id);
            if (schedule == null)
                return NotFound(new { error = "Project not found." });

            return Ok(schedule);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching schedule for project {Id}", id);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── POST /api/projects ─────────────────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> CreateProject([FromBody] CreateProjectRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            var project = await _projectService.CreateProjectAsync(uid, request);
            return Ok(new { message = "Project created successfully.", project });
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
            _logger.LogError(ex, "Error creating project");
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }
}
