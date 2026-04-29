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

    // ── PUT /api/projects/{id} ────────────────────────────────────────────
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateProject(string id, [FromBody] UpdateProjectRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var project = await _projectService.UpdateProjectAsync(uid, id, request);
            if (project == null) return NotFound(new { error = "Project not found." });
            return Ok(project);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (KeyNotFoundException ex)        { return NotFound(new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating project {Id}", id);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── DELETE /api/projects/{id} ─────────────────────────────────────────
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteProject(string id)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var deleted = await _projectService.DeleteProjectAsync(uid, id);
            if (!deleted) return NotFound(new { error = "Project not found." });
            return NoContent();
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (KeyNotFoundException ex)        { return NotFound(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting project {Id}", id);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── GET /api/projects/{id}/tasks ──────────────────────────────────────
    [HttpGet("{id}/tasks")]
    public async Task<IActionResult> GetProjectTasks(string id)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var tasks = await _projectService.GetProjectTasksAsync(uid, id);
            if (tasks == null) return NotFound(new { error = "Project not found." });
            return Ok(tasks);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching tasks for project {Id}", id);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── POST /api/projects/{id}/tasks ─────────────────────────────────────
    [HttpPost("{id}/tasks")]
    public async Task<IActionResult> CreateProjectTask(string id, [FromBody] CreateTaskRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var task = await _projectService.CreateProjectTaskAsync(uid, id, request);
            if (task == null) return NotFound(new { error = "Project not found." });
            return StatusCode(201, task);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating task for project {Id}", id);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── PUT /api/projects/{id}/tasks/{taskId} ─────────────────────────────
    [HttpPut("{id}/tasks/{taskId}")]
    public async Task<IActionResult> UpdateProjectTask(string id, string taskId, [FromBody] UpdateTaskRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var task = await _projectService.UpdateProjectTaskAsync(uid, id, taskId, request);
            if (task == null) return NotFound(new { error = "Task not found." });
            return Ok(task);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating task {TaskId}", taskId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── DELETE /api/projects/{id}/tasks/{taskId} ──────────────────────────
    [HttpDelete("{id}/tasks/{taskId}")]
    public async Task<IActionResult> DeleteProjectTask(string id, string taskId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var result = await _projectService.DeleteProjectTaskAsync(uid, id, taskId);
            if (result == null)  return NotFound(new { error = "Project not found." });
            if (result == false) return NotFound(new { error = "Task not found." });
            return NoContent();
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting task {TaskId}", taskId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── GET /api/projects/{id}/briefs ─────────────────────────────────────
    [HttpGet("{id}/briefs")]
    public async Task<IActionResult> GetProjectBriefs(string id)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var briefs = await _projectService.GetProjectBriefsAsync(uid, id);
            if (briefs == null) return NotFound(new { error = "Project not found." });
            return Ok(briefs);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching briefs for project {Id}", id);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── POST /api/projects/{id}/briefs ────────────────────────────────────
    [HttpPost("{id}/briefs")]
    public async Task<IActionResult> CreateProjectBrief(string id, [FromBody] CreateBriefRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var brief = await _projectService.CreateProjectBriefAsync(uid, id, request);
            if (brief == null) return NotFound(new { error = "Project not found." });
            return StatusCode(201, brief);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating brief for project {Id}", id);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── PUT /api/projects/{id}/briefs/{briefId} ───────────────────────────
    [HttpPut("{id}/briefs/{briefId}")]
    public async Task<IActionResult> UpdateProjectBrief(string id, string briefId, [FromBody] UpdateBriefRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var brief = await _projectService.UpdateProjectBriefAsync(uid, id, briefId, request);
            if (brief == null) return NotFound(new { error = "Brief not found." });
            return Ok(brief);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating brief {BriefId}", briefId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── DELETE /api/projects/{id}/briefs/{briefId} ────────────────────────
    [HttpDelete("{id}/briefs/{briefId}")]
    public async Task<IActionResult> DeleteProjectBrief(string id, string briefId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var result = await _projectService.DeleteProjectBriefAsync(uid, id, briefId);
            if (result == null)  return NotFound(new { error = "Project not found." });
            if (result == false) return NotFound(new { error = "Brief not found." });
            return NoContent();
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting brief {BriefId}", briefId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── GET /api/projects/{id}/events/{eventId}/potential-workers ──────────
    [HttpGet("{id}/events/{eventId}/potential-workers")]
    public async Task<IActionResult> GetPotentialWorkers(string id, string eventId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var workers = await _projectService.GetPotentialWorkersAsync(uid, id, eventId);
            if (workers == null) return NotFound(new { error = "Project or event not found." });
            return Ok(workers);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching potential workers for event {EventId}", eventId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── GET /api/projects/{id}/briefs/{briefId}/acknowledgments ──────────────
    [HttpGet("{id}/briefs/{briefId}/acknowledgments")]
    public async Task<IActionResult> GetProjectBriefAcknowledgments(string id, string briefId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var acks = await _projectService.GetBriefAcknowledgmentsAsync(uid, briefId);
            if (acks == null) return NotFound(new { error = "Brief not found." });
            return Ok(acks);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching acknowledgments for brief {BriefId}", briefId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── POST /api/projects/{id}/events/{eventId}/potential-workers/{employeeFBUID}/send-offer
    [HttpPost("{id}/events/{eventId}/potential-workers/{employeeFBUID}/send-offer")]
    public async Task<IActionResult> SendOfferToEmployee(
        string id, string eventId, string employeeFBUID, [FromBody] SendOfferRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            await _projectService.SendOfferToEmployeeAsync(uid, id, eventId, employeeFBUID, request);
            return Ok(new { message = "Offer sent successfully." });
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (KeyNotFoundException ex)        { return NotFound(new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending offer to employee {EmployeeFBUID}", employeeFBUID);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }
}
