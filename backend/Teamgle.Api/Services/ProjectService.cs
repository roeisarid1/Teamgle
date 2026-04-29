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

    private static string ComputeDisplayStatus(string status, DateTime? startDate, DateTime? endDate)
    {
        if (status == "draft" || status == "canceled") return status;
        if (startDate == null || endDate == null) return "planning";
        var today = DateTime.UtcNow.Date;
        if (today < startDate.Value.Date) return "planning";
        if (today > endDate.Value.Date) return "completed";
        return "active";
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
            if (eventRequest.EndTime <= eventRequest.StartTime)
                throw new ArgumentException($"Event '{eventRequest.Name}': end time must be after start time.");
            if (request.StartDate.HasValue && eventRequest.StartTime.Date < request.StartDate.Value.Date)
                throw new ArgumentException($"Event '{eventRequest.Name}': start time is before the project start date.");
            if (request.EndDate.HasValue && eventRequest.EndTime.Date > request.EndDate.Value.Date)
                throw new ArgumentException($"Event '{eventRequest.Name}': end time is after the project end date.");

            var eventId = await _projectRepo.CreateEventAsync(projId, eventRequest);

            foreach (var shiftRequest in eventRequest.Shifts)
            {
                if (string.IsNullOrWhiteSpace(shiftRequest.RollId))
                    throw new ArgumentException("Shift role is required.");
                if (shiftRequest.RequiredQuantity < 1)
                    throw new ArgumentException("Shift required quantity must be at least 1.");
                if (shiftRequest.EndTime <= shiftRequest.StartTime)
                    throw new ArgumentException("Shift end time must be after start time.");
                if (shiftRequest.StartTime < eventRequest.StartTime)
                    throw new ArgumentException($"A shift in event '{eventRequest.Name}' starts before the event.");
                if (shiftRequest.EndTime > eventRequest.EndTime)
                    throw new ArgumentException($"A shift in event '{eventRequest.Name}' ends after the event.");

                await _projectRepo.CreateShiftAsync(eventId, shiftRequest);
            }
        }

        done:
        return new ProjectResponse
        {
            ProjId         = projId,
            Name           = request.Name.Trim(),
            StartDate      = request.StartDate,
            EndDate        = request.EndDate,
            Status         = request.Status,
            CustomerId     = request.CustomerId,
            DisplayStatus  = ComputeDisplayStatus(request.Status, request.StartDate, request.EndDate),
        };
    }

    // ── Update project ─────────────────────────────────────────────────────
    public async Task<ProjectResponse?> UpdateProjectAsync(string firebaseUid, string projId, UpdateProjectRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            throw new ArgumentException("Project name is required.");
        if (request.EndDate.HasValue && request.StartDate.HasValue && request.EndDate < request.StartDate)
            throw new ArgumentException("End date cannot be before start date.");

        await ResolveCompanyIdAsync(firebaseUid);
        var project = await _projectRepo.UpdateProjectAsync(projId, request, firebaseUid);
        if (project != null)
            project.DisplayStatus = ComputeDisplayStatus(project.Status, project.StartDate, project.EndDate);
        return project;
    }

    // ── Delete project ─────────────────────────────────────────────────────
    public async Task<bool> DeleteProjectAsync(string firebaseUid, string projId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.DeleteProjectAsync(projId, firebaseUid);
    }

    // ── Update event ───────────────────────────────────────────────────────
    public async Task<EventResponse?> UpdateEventAsync(string firebaseUid, string eventId, UpdateEventRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            throw new ArgumentException("Event name is required.");
        if (request.EndTime <= request.StartTime)
            throw new ArgumentException("End time must be after start time.");

        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.UpdateEventAsync(eventId, request, firebaseUid);
    }

    // ── Delete event ───────────────────────────────────────────────────────
    public async Task<bool> DeleteEventAsync(string firebaseUid, string eventId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.DeleteEventAsync(eventId, firebaseUid);
    }

    // ── Get all projects for the authenticated manager ─────────────────────
    public async Task<IEnumerable<ProjectListItemResponse>> GetProjectsAsync(string firebaseUid)
    {
        var companyId = await _projectRepo.GetManagerCompanyIdAsync(firebaseUid);
        if (companyId == null)
            throw new UnauthorizedAccessException("User is not a registered manager.");

        var projects = (await _projectRepo.GetProjectsByManagerAsync(firebaseUid)).ToList();
        foreach (var p in projects)
            p.DisplayStatus = ComputeDisplayStatus(p.Status, p.StartDate, p.EndDate);
        return projects;
    }

    // ── Get a single project by ID (access-checked) ────────────────────────
    public async Task<ProjectDetailResponse?> GetProjectByIdAsync(string firebaseUid, string projId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        var detail = await _projectRepo.GetProjectDetailAsync(projId, firebaseUid);
        if (detail != null)
            detail.DisplayStatus = ComputeDisplayStatus(detail.Status, detail.StartDate, detail.EndDate);
        return detail;
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

    // ── Employee Job Offers ────────────────────────────────────────────────
    public async Task<IEnumerable<JobOfferResponse>> GetMyJobOffersAsync(string firebaseUid)
    {
        return await _projectRepo.GetJobOffersForEmployeeAsync(firebaseUid);
    }

    public async Task RespondToJobOfferAsync(string firebaseUid, string shiftId, bool accept)
    {
        var rowsAffected = await _projectRepo.RespondToJobOfferAsync(firebaseUid, shiftId, accept);
        if (rowsAffected == 0)
            throw new UnauthorizedAccessException("Offer not found, already responded, or does not belong to you.");
    }

    public async Task<IEnumerable<MyApplicationResponse>> GetMyApplicationsAsync(string firebaseUid)
    {
        return await _projectRepo.GetMyApplicationsAsync(firebaseUid);
    }

    public async Task<bool> ReportHoursAsync(string firebaseUid, string shiftId, DateTime? actualStart, DateTime? actualEnd)
    {
        return await _projectRepo.ReportHoursAsync(firebaseUid, shiftId, actualStart, actualEnd);
    }

    // ── Potential Workers ──────────────────────────────────────────────────
    public async Task<IEnumerable<PotentialWorkerResponse>?> GetPotentialWorkersAsync(string firebaseUid, string projId, string eventId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.GetPotentialWorkersAsync(projId, eventId, firebaseUid);
    }

    public async Task SendOfferToEmployeeAsync(string firebaseUid, string projId, string eventId, string employeeFbUid, SendOfferRequest request)
    {
        if (request.ShiftIds == null || request.ShiftIds.Count == 0)
            throw new ArgumentException("At least one shift must be selected.");

        await ResolveCompanyIdAsync(firebaseUid);
        await _projectRepo.SendOfferToEmployeeAsync(projId, eventId, employeeFbUid, request.ShiftIds, firebaseUid);
    }

    // ── Event Workers (Staffing) ──────────────────────────────────────────
    public async Task<EventWorkersResponse> GetEventWorkersAsync(string firebaseUid, string eventId)
    {
        await ResolveCompanyIdAsync(firebaseUid); // ensures caller is a manager
        return await _projectRepo.GetEventWorkersAsync(eventId, firebaseUid);
    }

    public async Task UpdateWorkerStatusAsync(
        string firebaseUid, string eventId, string employeeFbUid, string shiftId, string newStatus)
    {
        var allowed = new HashSet<string>
        {
            "manager_approved", "manager_hold",
            "manager_reject",   "manager_approved_canceled"
        };
        if (!allowed.Contains(newStatus))
            throw new ArgumentException($"Invalid status: {newStatus}");

        await ResolveCompanyIdAsync(firebaseUid);
        await _projectRepo.UpdateWorkerStatusAsync(eventId, employeeFbUid, shiftId, newStatus, firebaseUid);
    }

    public async Task DeleteWorkerAssignmentAsync(
        string firebaseUid, string eventId, string employeeFbUid, string shiftId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        await _projectRepo.DeleteWorkerAssignmentAsync(eventId, employeeFbUid, shiftId, firebaseUid);
    }

    // ── Event Tasks ────────────────────────────────────────────────────────
    public async Task<IEnumerable<TaskItem>?> GetEventTasksAsync(string firebaseUid, string eventId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.GetTasksByEventIdAsync(eventId, firebaseUid);
    }

    public async Task<TaskItem?> CreateEventTaskAsync(string firebaseUid, string eventId, CreateTaskRequest request)
    {
        ValidateTaskFields(request.Content, request.Status, request.Priority);
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.CreateEventTaskAsync(eventId, request, firebaseUid);
    }

    public async Task<TaskItem?> UpdateEventTaskAsync(string firebaseUid, string eventId, string taskId, UpdateTaskRequest request)
    {
        ValidateTaskFields(request.Content, request.Status, request.Priority);
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.UpdateEventTaskAsync(taskId, eventId, request, firebaseUid);
    }

    public async Task<bool?> DeleteEventTaskAsync(string firebaseUid, string eventId, string taskId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.DeleteEventTaskAsync(taskId, eventId, firebaseUid);
    }

    // ── Event Briefs ───────────────────────────────────────────────────────
    public async Task<IEnumerable<BriefItem>?> GetEventBriefsAsync(string firebaseUid, string eventId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.GetBriefsByEventIdAsync(eventId, firebaseUid);
    }

    public async Task<BriefItem?> CreateEventBriefAsync(string firebaseUid, string eventId, CreateBriefRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
            throw new ArgumentException("Brief title is required.");
        if (string.IsNullOrWhiteSpace(request.Content))
            throw new ArgumentException("Brief content is required.");
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.CreateEventBriefAsync(eventId, request, firebaseUid);
    }

    public async Task<BriefItem?> UpdateEventBriefAsync(string firebaseUid, string eventId, string briefId, UpdateBriefRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
            throw new ArgumentException("Brief title is required.");
        if (string.IsNullOrWhiteSpace(request.Content))
            throw new ArgumentException("Brief content is required.");
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.UpdateEventBriefAsync(briefId, eventId, request, firebaseUid);
    }

    public async Task<bool?> DeleteEventBriefAsync(string firebaseUid, string eventId, string briefId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.DeleteEventBriefAsync(briefId, eventId, firebaseUid);
    }

    // ── Event Expenses ─────────────────────────────────────────────────────
    private static readonly HashSet<string> ValidExpenseTypes =
        ["venue", "catering", "equipment", "staffing", "transport", "marketing", "other"];

    public async Task<IEnumerable<EventExpenseItem>?> GetEventExpensesAsync(string firebaseUid, string eventId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.GetEventExpensesAsync(eventId, firebaseUid);
    }

    public async Task<EventExpenseItem?> CreateEventExpenseAsync(string firebaseUid, string eventId, CreateExpenseRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.ExpenseType))
            throw new ArgumentException("Expense type is required.");
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.CreateEventExpenseAsync(eventId, request, firebaseUid);
    }

    public async Task<EventExpenseItem?> UpdateEventExpenseAsync(string firebaseUid, string eventId, string expenseId, UpdateExpenseRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.ExpenseType))
            throw new ArgumentException("Expense type is required.");
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.UpdateEventExpenseAsync(expenseId, eventId, request, firebaseUid);
    }

    public async Task<bool?> DeleteEventExpenseAsync(string firebaseUid, string eventId, string expenseId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.DeleteEventExpenseAsync(expenseId, eventId, firebaseUid);
    }

    // ── Event Payroll ──────────────────────────────────────────────────────
    private static readonly HashSet<string> ValidPaymentStatuses = ["pending", "approved", "paid"];

    public async Task<IEnumerable<PayrollItem>?> GetEventPayrollAsync(string firebaseUid, string eventId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.GetEventPayrollAsync(eventId, firebaseUid);
    }

    public async Task<PayrollItem?> ApproveHoursAsync(string firebaseUid, string eventId, string shiftId, string employeeUserId, ApproveHoursRequest request)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.ApproveHoursAsync(shiftId, employeeUserId, eventId, request, firebaseUid);
    }

    public async Task<PayrollItem?> SavePayrollAsync(string firebaseUid, string eventId, string shiftId, string employeeUserId, SavePayrollRequest request)
    {
        if (!ValidPaymentStatuses.Contains(request.PaymentStatus))
            throw new ArgumentException($"Invalid payment_status '{request.PaymentStatus}'. Allowed: pending, approved, paid.");
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.SavePayrollAsync(shiftId, employeeUserId, eventId, request, firebaseUid);
    }

    public async Task<PayrollItem?> UpdatePayrollAsync(string firebaseUid, string eventId, string shiftId, string employeeUserId, UpdatePayrollRequest request)
    {
        if (!ValidPaymentStatuses.Contains(request.PaymentStatus))
            throw new ArgumentException($"Invalid payment_status '{request.PaymentStatus}'. Allowed: pending, approved, paid.");
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.UpdatePayrollAsync(shiftId, employeeUserId, eventId, request, firebaseUid);
    }

    // ── Brief Acknowledgment ───────────────────────────────────────────────
    public async Task<IEnumerable<AcknowledgmentItem>?> GetBriefAcknowledgmentsAsync(string firebaseUid, string briefId)
    {
        await ResolveCompanyIdAsync(firebaseUid);
        return await _projectRepo.GetBriefAcknowledgmentsAsync(briefId, firebaseUid);
    }

    public async Task<bool> AcknowledgeBriefAsync(string firebaseUid, string briefId)
    {
        return await _projectRepo.AcknowledgeBriefAsync(briefId, firebaseUid);
    }

    public async Task<IEnumerable<EmployeeBriefItem>?> GetMyBriefsAsync(string firebaseUid)
    {
        return await _projectRepo.GetBriefsForEmployeeAsync(firebaseUid);
    }

    public async Task<AutoAssignResult> AutoAssignShiftAsync(string firebaseUid, string shiftId)
    {
        return await _projectRepo.AutoAssignShiftAsync(shiftId, firebaseUid);
    }
}
