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
}
