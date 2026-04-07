using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Repositories;

public interface IProjectRepository
{
    Task<string?> GetManagerCompanyIdAsync(string firebaseUid);
    Task<string?> GetManagerUserIdAsync(string firebaseUid);

    // ── Project ────────────────────────────────────────────────────────────
    Task<string> CreateProjectAsync(string companyId, CreateProjectRequest request);
    Task CreateManagerProjectAsync(string projId, string userId);

    // ── Event ──────────────────────────────────────────────────────────────
    Task<string> CreateEventAsync(string projId, CreateEventRequest request);

    // ── Shift ──────────────────────────────────────────────────────────────
    Task CreateShiftAsync(string eventId, CreateShiftRequest request);
    Task CreateEventShiftAsync(string eventId, string firebaseUid, CreateShiftRequest request);
    Task UpdateShiftAsync(string shiftId, string firebaseUid, UpdateShiftRequest request);
    Task DeleteShiftAsync(string shiftId, string firebaseUid);

    // ── Query ──────────────────────────────────────────────────────────────
    Task<IEnumerable<ProjectListItemResponse>> GetProjectsByManagerAsync(string firebaseUid);
    Task<ProjectDetailResponse?> GetProjectDetailAsync(string projId, string firebaseUid);
    Task<ProjectScheduleResponse?> GetProjectScheduleAsync(string projId, string firebaseUid);

    // ── Tasks ──────────────────────────────────────────────────────────────
    Task<IEnumerable<TaskItem>?> GetTasksByProjectIdAsync(string projId, string firebaseUid);
    Task<TaskItem?> CreateTaskAsync(string projId, CreateTaskRequest request, string firebaseUid);
    Task<TaskItem?> UpdateTaskAsync(string taskId, string projId, UpdateTaskRequest request, string firebaseUid);
    Task<bool?> DeleteTaskAsync(string taskId, string projId, string firebaseUid);

    // ── Briefs ─────────────────────────────────────────────────────────────
    Task<IEnumerable<BriefItem>?> GetBriefsByProjectIdAsync(string projId, string firebaseUid);
    Task<BriefItem?> CreateBriefAsync(string projId, CreateBriefRequest request, string firebaseUid);
    Task<BriefItem?> UpdateBriefAsync(string briefId, string projId, UpdateBriefRequest request, string firebaseUid);
    Task<bool?> DeleteBriefAsync(string briefId, string projId, string firebaseUid);

    // ── Employee Job Offers ────────────────────────────────────────────────
    Task<IEnumerable<JobOfferResponse>> GetJobOffersForEmployeeAsync(string firebaseUid);
    Task<int> RespondToJobOfferAsync(string firebaseUid, string shiftId, bool accept);

    // ── Potential Workers ──────────────────────────────────────────────────
    Task<IEnumerable<PotentialWorkerResponse>?> GetPotentialWorkersAsync(string projId, string eventId, string firebaseUid);
    Task SendOfferToEmployeeAsync(string projId, string eventId, string employeeFbUid, List<string> shiftIds, string firebaseUid);

    // ── Event Workers (Staffing) ───────────────────────────────────────────
    Task<EventWorkersResponse> GetEventWorkersAsync(string eventId, string firebaseUid);
    Task UpdateWorkerStatusAsync(string eventId, string employeeFbUid, string shiftId, string newStatus, string managerFbUid);
    Task DeleteWorkerAssignmentAsync(string eventId, string employeeFbUid, string shiftId, string managerFbUid);
}
