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
        const string sql = """
            SELECT DISTINCT
                t.task_ID                                AS TaskId,
                t.content                                AS Content,
                t.priority                               AS Priority,
                t.status                                 AS Status,
                t.project_ID                             AS ProjectId,
                t.event_ID                               AS EventId,
                t.shift_ID                               AS ShiftId,
                COALESCE(dp.name, ep.name, sp.name)      AS ProjectName,
                COALESCE(de.name, se.name)               AS EventName
            FROM Task t
            -- Direct project link
            LEFT JOIN Project  dp  ON t.project_ID  = dp.Proj_ID
            LEFT JOIN Customer c1  ON dp.customer_ID = c1.customer_ID
            -- Direct event link → its project
            LEFT JOIN Event    de  ON t.event_ID    = de.event_ID
            LEFT JOIN Project  ep  ON de.project_ID  = ep.Proj_ID
            LEFT JOIN Customer c2  ON ep.customer_ID = c2.customer_ID
            -- Shift link → its event → its project
            LEFT JOIN Shift    ds  ON t.shift_ID    = ds.Shift_ID
            LEFT JOIN Event    se  ON ds.event_ID   = se.event_ID
            LEFT JOIN Project  sp  ON se.project_ID  = sp.Proj_ID
            LEFT JOIN Customer c3  ON sp.customer_ID = c3.customer_ID
            WHERE
                COALESCE(c1.company_ID, c2.company_ID, c3.company_ID) =
                (SELECT u.company_ID FROM [User] u WHERE u.FBUID = @fbuid)
            ORDER BY t.task_ID
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);
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
