using System.Data;
using Microsoft.Data.SqlClient;
using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Repositories;

public class TaskRepository : ITaskRepository
{
    private readonly string _connectionString;

    public TaskRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("myProjDB")
            ?? throw new InvalidOperationException("ConnectionStrings:myProjDB is not set.");
    }

    // ── Get all tasks scoped to the manager's projects ────────────────────
    // A task belongs to this manager if its project_ID, event's project_ID,
    // or shift's event's project_ID is in their Manager_Project list.
    public async Task<IEnumerable<TaskResponse>> GetTasksByManagerAsync(string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_GetTasksByManager", conn)
        {
            CommandType = CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@fbuid", firebaseUid);

        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();

        var tasks = new List<TaskResponse>();
        while (await reader.ReadAsync())
        {
            tasks.Add(new TaskResponse
            {
                TaskId      = reader["TaskId"].ToString()!,
                Content     = reader["Content"].ToString()!,
                Priority    = reader["Priority"].ToString()!,
                Status      = reader["Status"].ToString()!,
                ProjectId   = reader["ProjectId"]  as string,
                EventId     = reader["EventId"]    as string,
                ShiftId     = reader["ShiftId"]    as string,
                ProjectName = reader["ProjectName"] as string,
                EventName   = reader["EventName"]   as string,
            });
        }
        return tasks;
    }
}
