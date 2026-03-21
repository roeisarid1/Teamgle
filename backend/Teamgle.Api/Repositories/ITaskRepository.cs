using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Repositories;

public interface ITaskRepository
{
    Task<IEnumerable<TaskResponse>> GetTasksByManagerAsync(string firebaseUid);
}
