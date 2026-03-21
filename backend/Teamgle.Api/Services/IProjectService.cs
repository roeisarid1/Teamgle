using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Services;

public interface IProjectService
{
    Task<ProjectResponse> CreateProjectAsync(string firebaseUid, CreateProjectRequest request);
    Task<IEnumerable<ProjectListItemResponse>> GetProjectsAsync(string firebaseUid);
    Task<ProjectDetailResponse?> GetProjectByIdAsync(string firebaseUid, string projId);
}
