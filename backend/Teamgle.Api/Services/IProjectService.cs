using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Services;

public interface IProjectService
{
    Task<ProjectResponse> CreateProjectAsync(string firebaseUid, CreateProjectRequest request);
    Task<IEnumerable<ProjectListItemResponse>> GetProjectsAsync(string firebaseUid);
    Task<ProjectDetailResponse?> GetProjectByIdAsync(string firebaseUid, string projId);
    Task<ProjectScheduleResponse?> GetProjectScheduleAsync(string firebaseUid, string projId);
    Task CreateEventShiftAsync(string firebaseUid, string eventId, CreateShiftRequest request);
    Task UpdateShiftAsync(string firebaseUid, string shiftId, UpdateShiftRequest request);
    Task DeleteShiftAsync(string firebaseUid, string shiftId);

    // ── Project Tasks ──────────────────────────────────────────────────────
    Task<IEnumerable<TaskItem>?> GetProjectTasksAsync(string firebaseUid, string projId);
    Task<TaskItem?> CreateProjectTaskAsync(string firebaseUid, string projId, CreateTaskRequest request);
    Task<TaskItem?> UpdateProjectTaskAsync(string firebaseUid, string projId, string taskId, UpdateTaskRequest request);
    Task<bool?> DeleteProjectTaskAsync(string firebaseUid, string projId, string taskId);

    // ── Project Briefs ─────────────────────────────────────────────────────
    Task<IEnumerable<BriefItem>?> GetProjectBriefsAsync(string firebaseUid, string projId);
    Task<BriefItem?> CreateProjectBriefAsync(string firebaseUid, string projId, CreateBriefRequest request);
    Task<BriefItem?> UpdateProjectBriefAsync(string firebaseUid, string projId, string briefId, UpdateBriefRequest request);
    Task<bool?> DeleteProjectBriefAsync(string firebaseUid, string projId, string briefId);

    // ── Employee Job Offers ────────────────────────────────────────────────
    Task<IEnumerable<JobOfferResponse>> GetMyJobOffersAsync(string firebaseUid);
    Task RespondToJobOfferAsync(string firebaseUid, string shiftId, bool accept);
    Task<IEnumerable<MyApplicationResponse>> GetMyApplicationsAsync(string firebaseUid);

    // ── Potential Workers ──────────────────────────────────────────────────
    Task<IEnumerable<PotentialWorkerResponse>?> GetPotentialWorkersAsync(string firebaseUid, string projId, string eventId);
    Task SendOfferToEmployeeAsync(string firebaseUid, string projId, string eventId, string employeeFbUid, SendOfferRequest request);

    // ── Event Workers (Staffing) ───────────────────────────────────────────
    Task<EventWorkersResponse> GetEventWorkersAsync(string firebaseUid, string eventId);
    Task UpdateWorkerStatusAsync(string firebaseUid, string eventId, string employeeFbUid, string shiftId, string newStatus);
    Task DeleteWorkerAssignmentAsync(string firebaseUid, string eventId, string employeeFbUid, string shiftId);

    // ── Event Tasks ────────────────────────────────────────────────────────
    Task<IEnumerable<TaskItem>?> GetEventTasksAsync(string firebaseUid, string eventId);
    Task<TaskItem?> CreateEventTaskAsync(string firebaseUid, string eventId, CreateTaskRequest request);
    Task<TaskItem?> UpdateEventTaskAsync(string firebaseUid, string eventId, string taskId, UpdateTaskRequest request);
    Task<bool?> DeleteEventTaskAsync(string firebaseUid, string eventId, string taskId);

    // ── Event Briefs ───────────────────────────────────────────────────────
    Task<IEnumerable<BriefItem>?> GetEventBriefsAsync(string firebaseUid, string eventId);
    Task<BriefItem?> CreateEventBriefAsync(string firebaseUid, string eventId, CreateBriefRequest request);
    Task<BriefItem?> UpdateEventBriefAsync(string firebaseUid, string eventId, string briefId, UpdateBriefRequest request);
    Task<bool?> DeleteEventBriefAsync(string firebaseUid, string eventId, string briefId);

    // ── Event Expenses ─────────────────────────────────────────────────────
    Task<IEnumerable<EventExpenseItem>?> GetEventExpensesAsync(string firebaseUid, string eventId);
    Task<EventExpenseItem?> CreateEventExpenseAsync(string firebaseUid, string eventId, CreateExpenseRequest request);
    Task<EventExpenseItem?> UpdateEventExpenseAsync(string firebaseUid, string eventId, string expenseId, UpdateExpenseRequest request);
    Task<bool?> DeleteEventExpenseAsync(string firebaseUid, string eventId, string expenseId);

    // ── Event Payroll ──────────────────────────────────────────────────────
    Task<IEnumerable<PayrollItem>?> GetEventPayrollAsync(string firebaseUid, string eventId);
    Task<PayrollItem?> UpdatePayrollAsync(string firebaseUid, string eventId, string shiftId, string employeeUserId, UpdatePayrollRequest request);

    // ── Brief Acknowledgment ───────────────────────────────────────────────
    Task<IEnumerable<AcknowledgmentItem>?> GetBriefAcknowledgmentsAsync(string firebaseUid, string briefId);
    Task<bool> AcknowledgeBriefAsync(string firebaseUid, string briefId);
    Task<IEnumerable<EmployeeBriefItem>?> GetMyBriefsAsync(string firebaseUid);
}
