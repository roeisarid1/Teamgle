using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Repositories;

public interface IProjectRepository
{
    Task<string?> GetManagerCompanyIdAsync(string firebaseUid);
    Task<string?> GetManagerUserIdAsync(string firebaseUid);

    // ── Project ────────────────────────────────────────────────────────────
    Task<string> CreateProjectAsync(string companyId, CreateProjectRequest request);
    Task CreateManagerProjectAsync(string projId, string userId);
    Task<ProjectResponse?> UpdateProjectAsync(string projId, UpdateProjectRequest request, string firebaseUid);
    Task<bool> DeleteProjectAsync(string projId, string firebaseUid);

    // ── Event ──────────────────────────────────────────────────────────────
    Task<string> CreateEventAsync(string projId, CreateEventRequest request);
    Task<EventResponse?> UpdateEventAsync(string eventId, UpdateEventRequest request, string firebaseUid);
    Task<bool> DeleteEventAsync(string eventId, string firebaseUid);

    // ── Shift ──────────────────────────────────────────────────────────────
    Task CreateShiftAsync(string eventId, CreateShiftRequest request);
    Task CreateEventShiftAsync(string eventId, string firebaseUid, CreateShiftRequest request);
    Task UpdateShiftAsync(string shiftId, string firebaseUid, UpdateShiftRequest request);
    Task DeleteShiftAsync(string shiftId, string firebaseUid);

    // ── Query ──────────────────────────────────────────────────────────────
    Task<IEnumerable<ProjectListItemResponse>> GetProjectsByManagerAsync(string firebaseUid);
    Task<ProjectDetailResponse?> GetProjectDetailAsync(string projId, string firebaseUid);
    Task<ProjectScheduleResponse?> GetProjectScheduleAsync(string projId, string firebaseUid);

    // ── Project Tasks ──────────────────────────────────────────────────────
    Task<IEnumerable<TaskItem>?> GetTasksByProjectIdAsync(string projId, string firebaseUid);
    Task<TaskItem?> CreateTaskAsync(string projId, CreateTaskRequest request, string firebaseUid);
    Task<TaskItem?> UpdateTaskAsync(string taskId, string projId, UpdateTaskRequest request, string firebaseUid);
    Task<bool?> DeleteTaskAsync(string taskId, string projId, string firebaseUid);

    // ── Project Briefs ─────────────────────────────────────────────────────
    Task<IEnumerable<BriefItem>?> GetBriefsByProjectIdAsync(string projId, string firebaseUid);
    Task<BriefItem?> CreateBriefAsync(string projId, CreateBriefRequest request, string firebaseUid);
    Task<BriefItem?> UpdateBriefAsync(string briefId, string projId, UpdateBriefRequest request, string firebaseUid);
    Task<bool?> DeleteBriefAsync(string briefId, string projId, string firebaseUid);

    // ── Employee Job Offers ────────────────────────────────────────────────
    Task<IEnumerable<JobOfferResponse>> GetJobOffersForEmployeeAsync(string firebaseUid);
    Task<int> RespondToJobOfferAsync(string firebaseUid, string shiftId, bool accept);
    Task<IEnumerable<MyApplicationResponse>> GetMyApplicationsAsync(string firebaseUid);
    Task<bool> ReportHoursAsync(string firebaseUid, string shiftId, DateTime? actualStart, DateTime? actualEnd);

    // ── Potential Workers ──────────────────────────────────────────────────
    Task<IEnumerable<PotentialWorkerResponse>?> GetPotentialWorkersAsync(string projId, string eventId, string firebaseUid);
    Task SendOfferToEmployeeAsync(string projId, string eventId, string employeeFbUid, List<string> shiftIds, string firebaseUid);

    // ── Event Workers (Staffing) ───────────────────────────────────────────
    Task<EventWorkersResponse> GetEventWorkersAsync(string eventId, string firebaseUid);
    Task UpdateWorkerStatusAsync(string eventId, string employeeFbUid, string shiftId, string newStatus, string managerFbUid);
    Task DeleteWorkerAssignmentAsync(string eventId, string employeeFbUid, string shiftId, string managerFbUid);

    // ── Event Tasks ────────────────────────────────────────────────────────
    Task<IEnumerable<TaskItem>?> GetTasksByEventIdAsync(string eventId, string firebaseUid);
    Task<TaskItem?> CreateEventTaskAsync(string eventId, CreateTaskRequest request, string firebaseUid);
    Task<TaskItem?> UpdateEventTaskAsync(string taskId, string eventId, UpdateTaskRequest request, string firebaseUid);
    Task<bool?> DeleteEventTaskAsync(string taskId, string eventId, string firebaseUid);

    // ── Event Briefs ───────────────────────────────────────────────────────
    Task<IEnumerable<BriefItem>?> GetBriefsByEventIdAsync(string eventId, string firebaseUid);
    Task<BriefItem?> CreateEventBriefAsync(string eventId, CreateBriefRequest request, string firebaseUid);
    Task<BriefItem?> UpdateEventBriefAsync(string briefId, string eventId, UpdateBriefRequest request, string firebaseUid);
    Task<bool?> DeleteEventBriefAsync(string briefId, string eventId, string firebaseUid);

    // ── Event Expenses ─────────────────────────────────────────────────────
    Task<IEnumerable<EventExpenseItem>?> GetEventExpensesAsync(string eventId, string firebaseUid);
    Task<EventExpenseItem?> CreateEventExpenseAsync(string eventId, CreateExpenseRequest request, string firebaseUid);
    Task<EventExpenseItem?> UpdateEventExpenseAsync(string expenseId, string eventId, UpdateExpenseRequest request, string firebaseUid);
    Task<bool?> DeleteEventExpenseAsync(string expenseId, string eventId, string firebaseUid);

    // ── Event Payroll (Employee_Shift hours) ───────────────────────────────
    Task<IEnumerable<PayrollItem>?> GetEventPayrollAsync(string eventId, string firebaseUid);
    Task<PayrollItem?> ApproveHoursAsync(string shiftId, string employeeUserId, string eventId, ApproveHoursRequest request, string firebaseUid);
    Task<PayrollItem?> SavePayrollAsync(string shiftId, string employeeUserId, string eventId, SavePayrollRequest request, string firebaseUid);
    Task<PayrollItem?> UpdatePayrollAsync(string shiftId, string employeeUserId, string eventId, UpdatePayrollRequest request, string firebaseUid);

    // ── Brief Acknowledgment ───────────────────────────────────────────────
    Task<IEnumerable<AcknowledgmentItem>?> GetBriefAcknowledgmentsAsync(string briefId, string firebaseUid);
    Task<IEnumerable<AcknowledgmentItem>?> GetProjectBriefAcknowledgmentsAsync(string projId, string briefId, string firebaseUid);
    Task<bool> AcknowledgeBriefAsync(string briefId, string firebaseUid);
    Task<IEnumerable<EmployeeBriefItem>?> GetBriefsForEmployeeAsync(string firebaseUid);

    // ── Auto-Assign ────────────────────────────────────────────────────────
    Task<AutoAssignResult> AutoAssignShiftAsync(string shiftId, string managerFbUid);

    // ── Event-first (standalone events) ───────────────────────────────────
    Task<IEnumerable<EventListItemResponse>> GetEventsByManagerAsync(string firebaseUid);
    Task<ScheduleEventItem?> GetEventScheduleByIdAsync(string eventId, string firebaseUid);
    Task<string> CreateStandaloneEventAsync(string companyId, string managerId, CreateEventStandaloneRequest request);
    Task<IEnumerable<PotentialWorkerResponse>?> GetPotentialWorkersByEventAsync(string eventId, string firebaseUid);
    Task SendOfferByEventAsync(string eventId, string employeeFbUid, List<string> shiftIds, string firebaseUid);
}
