using Teamgle.Api.Models.DTOs;
using Teamgle.Api.Repositories;

namespace Teamgle.Api.Services;

public class TaskService : ITaskService
{
    private readonly ITaskRepository _taskRepo;

    public TaskService(ITaskRepository taskRepo)
    {
        _taskRepo = taskRepo;
    }

    public async Task<IEnumerable<TaskResponse>> GetTasksAsync(string firebaseUid)
    {
        return await _taskRepo.GetTasksByManagerAsync(firebaseUid);
    }
}
