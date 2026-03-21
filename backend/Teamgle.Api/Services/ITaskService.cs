using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Services;

public interface ITaskService
{
    Task<IEnumerable<TaskResponse>> GetTasksAsync(string firebaseUid);
}
