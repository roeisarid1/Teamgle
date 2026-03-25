using Teamgle.Api.Models.DTOs;
using Teamgle.Api.Repositories;

namespace Teamgle.Api.Services;

public class ProjectService : IProjectService
{
    private readonly IProjectRepository _projectRepo;

    public ProjectService(IProjectRepository projectRepo)
    {
        _projectRepo = projectRepo;
    }

    // ── Resolve manager's company (shared guard) ───────────────────────────
    private async Task<string> ResolveCompanyIdAsync(string firebaseUid)
    {
        var companyId = await _projectRepo.GetManagerCompanyIdAsync(firebaseUid);
        if (companyId == null)
            throw new UnauthorizedAccessException("User is not a registered manager.");
        return companyId;
    }

    // ── Create project with events and shifts (transactional by design) ────
    public async Task<ProjectResponse> CreateProjectAsync(string firebaseUid, CreateProjectRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            throw new ArgumentException("Project name is required.");
        if (request.Status != "draft")
        {
            if (request.StartDate == null)
                throw new ArgumentException("Start date is required.");
            if (request.EndDate == null)
                throw new ArgumentException("End date is required.");
            if (request.EndDate < request.StartDate)
                throw new ArgumentException("End date cannot be before start date.");
        }

        var companyId = await ResolveCompanyIdAsync(firebaseUid);

        var userId = await _projectRepo.GetManagerUserIdAsync(firebaseUid)
            ?? throw new UnauthorizedAccessException("Manager user record not found.");

        // 1. Create the project
        var projId = await _projectRepo.CreateProjectAsync(companyId, request);

        // 2. Link manager as owner
        await _projectRepo.CreateManagerProjectAsync(projId, userId);

        // 3. Create each event and its shifts (skipped entirely for drafts)
        if (request.Status == "draft" || request.Events == null || !request.Events.Any())
            goto done;

        foreach (var eventRequest in request.Events)
        {
            if (string.IsNullOrWhiteSpace(eventRequest.Name))
                throw new ArgumentException("Event name is required.");

            var eventId = await _projectRepo.CreateEventAsync(projId, eventRequest);

            foreach (var shiftRequest in eventRequest.Shifts)
            {
                if (string.IsNullOrWhiteSpace(shiftRequest.RollId))
                    throw new ArgumentException("Shift role is required.");
                if (shiftRequest.RequiredQuantity < 1)
                    throw new ArgumentException("Shift required quantity must be at least 1.");

                await _projectRepo.CreateShiftAsync(eventId, shiftRequest);
            }
        }

        done:
        return new ProjectResponse
        {
            ProjId     = projId,
            Name       = request.Name.Trim(),
            StartDate  = request.StartDate,
            EndDate    = request.EndDate,
            Status     = request.Status,
            CustomerId = request.CustomerId
        };
    }

    // ── Get all projects for the authenticated manager ─────────────────────
    public async Task<IEnumerable<ProjectListItemResponse>> GetProjectsAsync(string firebaseUid)
    {
        var companyId = await _projectRepo.GetManagerCompanyIdAsync(firebaseUid);
        if (companyId == null)
            throw new UnauthorizedAccessException("User is not a registered manager.");

        return await _projectRepo.GetProjectsByManagerAsync(firebaseUid);
    }

    // ── Get a single project by ID (access-checked) ────────────────────────
    public async Task<ProjectDetailResponse?> GetProjectByIdAsync(string firebaseUid, string projId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.GetProjectDetailAsync(projId, firebaseUid);
    }

    // ── Tasks ──────────────────────────────────────────────────────────────
    private static readonly HashSet<string> ValidTaskStatuses   = ["open", "in_progress", "done", "canceled"];
    private static readonly HashSet<string> ValidTaskPriorities = ["low", "medium", "high", "urgent"];

    private static void ValidateTaskFields(string content, string status, string priority)
    {
        if (string.IsNullOrWhiteSpace(content))
            throw new ArgumentException("Task content is required.");
        if (!ValidTaskStatuses.Contains(status))
            throw new ArgumentException($"Invalid status '{status}'. Allowed: open, in_progress, done, canceled.");
        if (!ValidTaskPriorities.Contains(priority))
            throw new ArgumentException($"Invalid priority '{priority}'. Allowed: low, medium, high, urgent.");
    }

    public async Task<IEnumerable<TaskItem>?> GetProjectTasksAsync(string firebaseUid, string projId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.GetTasksByProjectIdAsync(projId, firebaseUid);
    }

    public async Task<TaskItem?> CreateProjectTaskAsync(string firebaseUid, string projId, CreateTaskRequest request)
    {
        ValidateTaskFields(request.Content, request.Status, request.Priority);
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.CreateTaskAsync(projId, request, firebaseUid);
    }

    public async Task<TaskItem?> UpdateProjectTaskAsync(string firebaseUid, string projId, string taskId, UpdateTaskRequest request)
    {
        ValidateTaskFields(request.Content, request.Status, request.Priority);
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.UpdateTaskAsync(taskId, projId, request, firebaseUid);
    }

    public async Task<bool?> DeleteProjectTaskAsync(string firebaseUid, string projId, string taskId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.DeleteTaskAsync(taskId, projId, firebaseUid);
    }

    // ── Briefs ─────────────────────────────────────────────────────────────
    public async Task<IEnumerable<BriefItem>?> GetProjectBriefsAsync(string firebaseUid, string projId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.GetBriefsByProjectIdAsync(projId, firebaseUid);
    }

    public async Task<BriefItem?> CreateProjectBriefAsync(string firebaseUid, string projId, CreateBriefRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
            throw new ArgumentException("Brief title is required.");
        if (string.IsNullOrWhiteSpace(request.Content))
            throw new ArgumentException("Brief content is required.");
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.CreateBriefAsync(projId, request, firebaseUid);
    }

    public async Task<BriefItem?> UpdateProjectBriefAsync(string firebaseUid, string projId, string briefId, UpdateBriefRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
            throw new ArgumentException("Brief title is required.");
        if (string.IsNullOrWhiteSpace(request.Content))
            throw new ArgumentException("Brief content is required.");
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.UpdateBriefAsync(briefId, projId, request, firebaseUid);
    }

    public async Task<bool?> DeleteProjectBriefAsync(string firebaseUid, string projId, string briefId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.DeleteBriefAsync(briefId, projId, firebaseUid);
    }
}
