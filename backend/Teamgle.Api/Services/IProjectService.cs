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

    // ── Tasks ──────────────────────────────────────────────────────────────
    Task<IEnumerable<TaskItem>?> GetProjectTasksAsync(string firebaseUid, string projId);
    Task<TaskItem?> CreateProjectTaskAsync(string firebaseUid, string projId, CreateTaskRequest request);
    Task<TaskItem?> UpdateProjectTaskAsync(string firebaseUid, string projId, string taskId, UpdateTaskRequest request);
    Task<bool?> DeleteProjectTaskAsync(string firebaseUid, string projId, string taskId);

    // ── Briefs ─────────────────────────────────────────────────────────────
    Task<IEnumerable<BriefItem>?> GetProjectBriefsAsync(string firebaseUid, string projId);
    Task<BriefItem?> CreateProjectBriefAsync(string firebaseUid, string projId, CreateBriefRequest request);
    Task<BriefItem?> UpdateProjectBriefAsync(string firebaseUid, string projId, string briefId, UpdateBriefRequest request);
    Task<bool?> DeleteProjectBriefAsync(string firebaseUid, string projId, string briefId);

    // ── Employee Job Offers ────────────────────────────────────────────────
    Task<IEnumerable<JobOfferResponse>> GetMyJobOffersAsync(string firebaseUid);
    Task RespondToJobOfferAsync(string firebaseUid, string shiftId, bool accept);

    // ── Potential Workers ──────────────────────────────────────────────────
    Task<IEnumerable<PotentialWorkerResponse>?> GetPotentialWorkersAsync(string firebaseUid, string projId, string eventId);
    Task SendOfferToEmployeeAsync(string firebaseUid, string projId, string eventId, string employeeFbUid, SendOfferRequest request);

    // ── Event Workers (Staffing) ───────────────────────────────────────────
    Task<EventWorkersResponse> GetEventWorkersAsync(string firebaseUid, string eventId);
    Task UpdateWorkerStatusAsync(string firebaseUid, string eventId, string employeeFbUid, string newStatus);
    Task DeleteWorkerAssignmentAsync(string firebaseUid, string eventId, string employeeFbUid);
}
