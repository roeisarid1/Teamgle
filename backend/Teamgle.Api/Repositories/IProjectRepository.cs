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

    // ── Query ──────────────────────────────────────────────────────────────
    Task<IEnumerable<ProjectListItemResponse>> GetProjectsByManagerAsync(string firebaseUid);
    Task<ProjectDetailResponse?> GetProjectDetailAsync(string projId, string firebaseUid);

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
}
