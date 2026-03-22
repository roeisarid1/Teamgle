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

    // ── Get schedule (events + shifts) for a project (access-checked) ─────
    public async Task<ProjectScheduleResponse?> GetProjectScheduleAsync(string firebaseUid, string projId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.GetProjectScheduleAsync(projId, firebaseUid);
    }

    // ── Create a shift for an event (access-checked via ownership in SQL) ──
    public async Task CreateEventShiftAsync(string firebaseUid, string eventId, CreateShiftRequest request)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        await _projectRepo.CreateEventShiftAsync(eventId, firebaseUid, request);
    }

    // ── Update a shift (access-checked via ownership in SQL) ───────────────
    public async Task UpdateShiftAsync(string firebaseUid, string shiftId, UpdateShiftRequest request)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        await _projectRepo.UpdateShiftAsync(shiftId, firebaseUid, request);
    }

    // ── Delete a shift (access-checked via ownership in SQL) ───────────────
    public async Task DeleteShiftAsync(string firebaseUid, string shiftId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        await _projectRepo.DeleteShiftAsync(shiftId, firebaseUid);
    }
}
