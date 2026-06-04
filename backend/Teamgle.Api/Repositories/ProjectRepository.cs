using System.Data;
using Microsoft.Data.SqlClient;
using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Repositories;

public class ProjectRepository : IProjectRepository
{
    private readonly string _connectionString;

    public ProjectRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("myProjDB")
            ?? throw new InvalidOperationException("ConnectionStrings:myProjDB is not set.");
    }

    // ── Get the company_ID for a manager by their Firebase UID ────────────
    public async Task<string?> GetManagerCompanyIdAsync(string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_GetManagerCompanyId", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@fbuid", firebaseUid);

        await conn.OpenAsync();
        var result = await cmd.ExecuteScalarAsync();
        return result as string;
    }

    // ── Get the user_ID for a manager by their Firebase UID ───────────────
    public async Task<string?> GetManagerUserIdAsync(string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_GetManagerUserIdByFbUid", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@fbuid", firebaseUid);

        await conn.OpenAsync();
        var result = await cmd.ExecuteScalarAsync();
        return result as string;
    }

    // ── Insert into Project, return new Proj_ID ───────────────────────────
    public async Task<string> CreateProjectAsync(string companyId, CreateProjectRequest request)
    {
        var projId = Guid.NewGuid().ToString();

        var validStatuses = new HashSet<string> { "draft", "planning", "active", "completed", "canceled" };
        var status = validStatuses.Contains(request.Status) ? request.Status : "draft";

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_CreateProject", conn)
            { CommandType = CommandType.StoredProcedure };

        cmd.Parameters.AddWithValue("@projId",     projId);
        cmd.Parameters.AddWithValue("@name",       request.Name.Trim());
        cmd.Parameters.AddWithValue("@startDate",  (object?)request.StartDate ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@endDate",    (object?)request.EndDate   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@status",     status);
        cmd.Parameters.AddWithValue("@customerId", (object?)request.CustomerId ?? DBNull.Value);

        await conn.OpenAsync();
        try
        {
            await cmd.ExecuteNonQueryAsync();
        }
        catch (SqlException ex)
        {
            throw new ArgumentException(ex.Message);
        }

        return projId;
    }

    // ── sp_UpdateProject ──────────────────────────────────────────────────
    public async Task<ProjectResponse?> UpdateProjectAsync(string projId, UpdateProjectRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_UpdateProject", conn)
            { CommandType = System.Data.CommandType.StoredProcedure };

        cmd.Parameters.AddWithValue("@projId",       projId);
        cmd.Parameters.AddWithValue("@managerFBUID", firebaseUid);
        cmd.Parameters.AddWithValue("@name",         request.Name.Trim());
        cmd.Parameters.AddWithValue("@startDate",    (object?)request.StartDate ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@endDate",      (object?)request.EndDate   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@status",       request.Status);
        cmd.Parameters.AddWithValue("@customerId",   (object?)request.CustomerId ?? DBNull.Value);

        await conn.OpenAsync();
        try
        {
            await using var reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
                return new ProjectResponse
                {
                    ProjId     = reader["projId"].ToString()!,
                    Name       = reader["name"].ToString()!,
                    StartDate  = reader["startDate"]   == DBNull.Value ? null : (DateTime?)Convert.ToDateTime(reader["startDate"]),
                    EndDate    = reader["endDate"]     == DBNull.Value ? null : (DateTime?)Convert.ToDateTime(reader["endDate"]),
                    Status     = reader["status"].ToString()!,
                    CustomerId = reader["customerId"]  == DBNull.Value ? null : reader["customerId"].ToString(),
                };
            return null;
        }
        catch (Microsoft.Data.SqlClient.SqlException ex)
        {
            var msg = ex.Message;
            if (msg.Contains("not a registered manager") || msg.Contains("access denied"))
                throw new UnauthorizedAccessException(msg);
            if (msg.Contains("not found"))
                throw new KeyNotFoundException(msg);
            throw new ArgumentException(msg);
        }
    }

    // ── sp_DeleteProject ──────────────────────────────────────────────────
    public async Task<bool> DeleteProjectAsync(string projId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_DeleteProject", conn)
            { CommandType = System.Data.CommandType.StoredProcedure };

        cmd.Parameters.AddWithValue("@projId",       projId);
        cmd.Parameters.AddWithValue("@managerFBUID", firebaseUid);

        await conn.OpenAsync();
        try
        {
            await cmd.ExecuteNonQueryAsync();
            return true;
        }
        catch (Microsoft.Data.SqlClient.SqlException ex)
        {
            var msg = ex.Message;
            if (msg.Contains("not a registered manager") || msg.Contains("access denied"))
                throw new UnauthorizedAccessException(msg);
            if (msg.Contains("not found"))
                throw new KeyNotFoundException(msg);
            throw new ArgumentException(msg);
        }
    }

    // ── sp_UpdateEvent ────────────────────────────────────────────────────
    public async Task<EventResponse?> UpdateEventAsync(string eventId, UpdateEventRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_UpdateEvent", conn)
            { CommandType = System.Data.CommandType.StoredProcedure };

        cmd.Parameters.AddWithValue("@eventId",         eventId);
        cmd.Parameters.AddWithValue("@managerFBUID",    firebaseUid);
        cmd.Parameters.AddWithValue("@name",            request.Name.Trim());
        cmd.Parameters.AddWithValue("@location",        (object?)request.Location?.Trim()  ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@startTime",       request.StartTime);
        cmd.Parameters.AddWithValue("@endTime",         request.EndTime);
        cmd.Parameters.AddWithValue("@status",          request.Status);
        cmd.Parameters.AddWithValue("@eventType",       (object?)request.EventType?.Trim()  ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@plannedBudget",   (object?)request.PlannedBudget      ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@expectedRevenue", (object?)request.ExpectedRevenue    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@attendeesCount",  (object?)request.AttendeesCount     ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@customerId",      (object?)request.CustomerId         ?? DBNull.Value);

        await conn.OpenAsync();
        try
        {
            await using var reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
                return new EventResponse
                {
                    EventId         = reader["eventId"].ToString()!,
                    Name            = reader["name"].ToString()!,
                    Location        = reader["location"]        == DBNull.Value ? null : reader["location"].ToString(),
                    StartTime       = reader["startTime"]       == DBNull.Value ? null : (DateTime?)Convert.ToDateTime(reader["startTime"]),
                    EndTime         = reader["endTime"]         == DBNull.Value ? null : (DateTime?)Convert.ToDateTime(reader["endTime"]),
                    Status          = reader["status"].ToString()!,
                    EventType       = reader["eventType"]       == DBNull.Value ? null : reader["eventType"].ToString(),
                    PlannedBudget   = reader["plannedBudget"]   == DBNull.Value ? null : (decimal?)Convert.ToDecimal(reader["plannedBudget"]),
                    ExpectedRevenue = reader["expectedRevenue"] == DBNull.Value ? null : (decimal?)Convert.ToDecimal(reader["expectedRevenue"]),
                    AttendeesCount  = reader["attendeesCount"]  == DBNull.Value ? null : (int?)Convert.ToInt32(reader["attendeesCount"]),
                    ProjectId       = reader["projectId"]       == DBNull.Value ? null : reader["projectId"].ToString(),
                    CustomerId      = reader["customerId"]      == DBNull.Value ? null : reader["customerId"].ToString(),
                    CustomerName    = reader["customerName"]    == DBNull.Value ? null : reader["customerName"].ToString(),
                };
            return null;
        }
        catch (Microsoft.Data.SqlClient.SqlException ex)
        {
            var msg = ex.Message;
            if (msg.Contains("not a registered manager") || msg.Contains("access denied"))
                throw new UnauthorizedAccessException(msg);
            if (msg.Contains("not found"))
                throw new KeyNotFoundException(msg);
            throw new ArgumentException(msg);
        }
    }

    // ── sp_DeleteEvent ────────────────────────────────────────────────────
    public async Task<bool> DeleteEventAsync(string eventId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_DeleteEvent", conn)
            { CommandType = System.Data.CommandType.StoredProcedure };

        cmd.Parameters.AddWithValue("@eventId",      eventId);
        cmd.Parameters.AddWithValue("@managerFBUID", firebaseUid);

        await conn.OpenAsync();
        try
        {
            await cmd.ExecuteNonQueryAsync();
            return true;
        }
        catch (Microsoft.Data.SqlClient.SqlException ex)
        {
            var msg = ex.Message;
            if (msg.Contains("not a registered manager") || msg.Contains("access denied"))
                throw new UnauthorizedAccessException(msg);
            if (msg.Contains("not found"))
                throw new KeyNotFoundException(msg);
            throw new ArgumentException(msg);
        }
    }

    // ── Insert into Manager_Project (links manager as owner) ──────────────
    public async Task CreateManagerProjectAsync(string projId, string userId)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_CreateManagerProject", conn)
            { CommandType = CommandType.StoredProcedure };

        cmd.Parameters.AddWithValue("@managerUserId", userId);
        cmd.Parameters.AddWithValue("@projectId",     projId);

        await conn.OpenAsync();
        await cmd.ExecuteNonQueryAsync();
    }

    // ── Insert into Event, return new event_ID ────────────────────────────
    public async Task<string> CreateEventAsync(string projId, CreateEventRequest request)
    {
        var eventId = Guid.NewGuid().ToString();

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_CreateEvent", conn)
            { CommandType = CommandType.StoredProcedure };

        cmd.Parameters.AddWithValue("@eventId",         eventId);
        cmd.Parameters.AddWithValue("@name",            request.Name.Trim());
        cmd.Parameters.AddWithValue("@location",        (object?)request.Location?.Trim()  ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@startTime",       request.StartTime);
        cmd.Parameters.AddWithValue("@endTime",         request.EndTime);
        cmd.Parameters.AddWithValue("@projectId",       projId);
        cmd.Parameters.AddWithValue("@attendeesCount",  (object?)request.AttendeesCount    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@eventType",       request.EventType?.Trim() ?? "other");
        cmd.Parameters.AddWithValue("@plannedBudget",   (object?)request.PlannedBudget     ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@expectedRevenue", (object?)request.ExpectedRevenue   ?? DBNull.Value);

        await conn.OpenAsync();
        await cmd.ExecuteNonQueryAsync();

        return eventId;
    }

    // ── Get all projects for a manager with aggregates ────────────────────
    public async Task<IEnumerable<ProjectListItemResponse>> GetProjectsByManagerAsync(string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_GetProjectsByManager", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@firebaseUid", firebaseUid);

        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();

        var results = new List<ProjectListItemResponse>();
        while (await reader.ReadAsync())
        {
            results.Add(new ProjectListItemResponse
            {
                ProjId        = reader.GetString(reader.GetOrdinal("ProjId")),
                Name          = reader.GetString(reader.GetOrdinal("Name")),
                StartDate     = reader.IsDBNull(reader.GetOrdinal("StartDate")) ? null : reader.GetDateTime(reader.GetOrdinal("StartDate")),
                EndDate       = reader.IsDBNull(reader.GetOrdinal("EndDate"))   ? null : reader.GetDateTime(reader.GetOrdinal("EndDate")),
                Status        = reader.GetString(reader.GetOrdinal("Status")),
                CustomerId    = reader.IsDBNull(reader.GetOrdinal("CustomerId"))
                                    ? null
                                    : reader.GetString(reader.GetOrdinal("CustomerId")),
                CustomerName  = reader.IsDBNull(reader.GetOrdinal("CustomerName"))
                                    ? null
                                    : reader.GetString(reader.GetOrdinal("CustomerName")),
                EventCount    = reader.GetInt32(reader.GetOrdinal("EventCount")),
                RequiredCount = reader.GetInt32(reader.GetOrdinal("RequiredCount")),
                StaffedCount  = reader.GetInt32(reader.GetOrdinal("StaffedCount")),
            });
        }
        return results;
    }

    // ── Get a single project detail (auth-checked) with its events ────────
    public async Task<ProjectDetailResponse?> GetProjectDetailAsync(string projId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        ProjectDetailResponse? detail = null;

        await using (var cmd = new SqlCommand("sp_GetProjectDetailHeader", conn))
        {
            cmd.CommandType = CommandType.StoredProcedure;
            cmd.Parameters.AddWithValue("@projId",      projId);
            cmd.Parameters.AddWithValue("@firebaseUid", firebaseUid);

            await using var reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                detail = new ProjectDetailResponse
                {
                    ProjId       = reader.GetString(reader.GetOrdinal("ProjId")),
                    Name         = reader.GetString(reader.GetOrdinal("Name")),
                    StartDate    = reader.IsDBNull(reader.GetOrdinal("StartDate"))    ? null : reader.GetDateTime(reader.GetOrdinal("StartDate")),
                    EndDate      = reader.IsDBNull(reader.GetOrdinal("EndDate"))      ? null : reader.GetDateTime(reader.GetOrdinal("EndDate")),
                    Status       = reader.GetString(reader.GetOrdinal("Status")),
                    CustomerId   = reader.IsDBNull(reader.GetOrdinal("CustomerId"))   ? null : reader.GetString(reader.GetOrdinal("CustomerId")),
                    CustomerName = reader.IsDBNull(reader.GetOrdinal("CustomerName")) ? null : reader.GetString(reader.GetOrdinal("CustomerName")),
                };
            }
        }

        if (detail == null) return null;

        await using (var cmd = new SqlCommand("sp_GetProjectDetailEvents", conn))
        {
            cmd.CommandType = CommandType.StoredProcedure;
            cmd.Parameters.AddWithValue("@projId", projId);

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                detail.Events.Add(new EventDetailItem
                {
                    EventId         = reader.GetString(reader.GetOrdinal("EventId")),
                    Name            = reader.GetString(reader.GetOrdinal("Name")),
                    Location        = reader.IsDBNull(reader.GetOrdinal("Location"))        ? null : reader.GetString(reader.GetOrdinal("Location")),
                    StartTime       = reader.IsDBNull(reader.GetOrdinal("StartTime"))       ? null : reader.GetDateTime(reader.GetOrdinal("StartTime")),
                    EndTime         = reader.IsDBNull(reader.GetOrdinal("EndTime"))         ? null : reader.GetDateTime(reader.GetOrdinal("EndTime")),
                    Status          = reader.GetString(reader.GetOrdinal("Status")),
                    EventType       = reader.IsDBNull(reader.GetOrdinal("EventType"))       ? null : reader.GetString(reader.GetOrdinal("EventType")),
                    PlannedBudget   = reader.IsDBNull(reader.GetOrdinal("PlannedBudget"))   ? null : reader.GetDecimal(reader.GetOrdinal("PlannedBudget")),
                    ExpectedRevenue = reader.IsDBNull(reader.GetOrdinal("ExpectedRevenue")) ? null : reader.GetDecimal(reader.GetOrdinal("ExpectedRevenue")),
                });
            }
        }

        detail.EventCount = detail.Events.Count;
        return detail;
    }

    // ── Get schedule (events + shifts with staffing) for a project ────────
    public async Task<ProjectScheduleResponse?> GetProjectScheduleAsync(string projId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        ProjectScheduleResponse? schedule = null;

        await using (var cmd = new SqlCommand("sp_GetProjectScheduleHeader", conn))
        {
            cmd.CommandType = CommandType.StoredProcedure;
            cmd.Parameters.AddWithValue("@projId",      projId);
            cmd.Parameters.AddWithValue("@firebaseUid", firebaseUid);

            await using var reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                schedule = new ProjectScheduleResponse
                {
                    ProjId = reader.GetString(reader.GetOrdinal("ProjId")),
                    Name   = reader.GetString(reader.GetOrdinal("Name")),
                };
            }
        }

        if (schedule == null) return null;

        await using (var cmd = new SqlCommand("sp_GetProjectScheduleItems", conn))
        {
            cmd.CommandType = CommandType.StoredProcedure;
            cmd.Parameters.AddWithValue("@projId", projId);

            await using var reader = await cmd.ExecuteReaderAsync();

            // Build event map to group rows (one row per shift, multiple shifts per event)
            var eventMap = new Dictionary<string, ScheduleEventItem>();

            while (await reader.ReadAsync())
            {
                var eventId = reader.GetString(reader.GetOrdinal("EventId"));

                if (!eventMap.TryGetValue(eventId, out var eventItem))
                {
                    eventItem = new ScheduleEventItem
                    {
                        EventId   = eventId,
                        EventName = reader.GetString(reader.GetOrdinal("EventName")),
                        StartTime = reader.IsDBNull(reader.GetOrdinal("EventStart"))    ? null : reader.GetDateTime(reader.GetOrdinal("EventStart")),
                        EndTime   = reader.IsDBNull(reader.GetOrdinal("EventEnd"))      ? null : reader.GetDateTime(reader.GetOrdinal("EventEnd")),
                        Location  = reader.IsDBNull(reader.GetOrdinal("EventLocation")) ? null : reader.GetString(reader.GetOrdinal("EventLocation")),
                    };
                    eventMap[eventId] = eventItem;
                }

                // Only add a shift row if a shift actually exists for this event
                if (!reader.IsDBNull(reader.GetOrdinal("ShiftId")))
                {
                    eventItem.Shifts.Add(new ScheduleShiftItem
                    {
                        ShiftId          = reader.GetString(reader.GetOrdinal("ShiftId")),
                        RoleId           = reader.IsDBNull(reader.GetOrdinal("RoleId"))   ? "" : reader.GetString(reader.GetOrdinal("RoleId")),
                        RoleName         = reader.IsDBNull(reader.GetOrdinal("RoleName")) ? "" : reader.GetString(reader.GetOrdinal("RoleName")),
                        RequiredQuantity = reader.GetInt32(reader.GetOrdinal("RequiredQuantity")),
                        StaffedCount     = reader.GetInt32(reader.GetOrdinal("StaffedCount")),
                        StartTime        = reader.IsDBNull(reader.GetOrdinal("ShiftStart")) ? null : reader.GetDateTime(reader.GetOrdinal("ShiftStart")),
                        EndTime          = reader.IsDBNull(reader.GetOrdinal("ShiftEnd"))   ? null : reader.GetDateTime(reader.GetOrdinal("ShiftEnd")),
                    });
                }
            }

            schedule.Events.AddRange(eventMap.Values);
        }

        return schedule;
    }

    // ── Update a shift (ownership-validated) ──────────────────────────────
    public async Task UpdateShiftAsync(string shiftId, string firebaseUid, UpdateShiftRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RollId))
            throw new ArgumentException("Role is required.");
        if (request.RequiredQuantity < 1)
            throw new ArgumentException("Required quantity must be at least 1.");
        if (request.EndTime <= request.StartTime)
            throw new ArgumentException("End time must be after start time.");

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_UpdateShift", conn)
            { CommandType = CommandType.StoredProcedure };

        cmd.Parameters.AddWithValue("@shiftId",          shiftId);
        cmd.Parameters.AddWithValue("@firebaseUid",      firebaseUid);
        cmd.Parameters.AddWithValue("@rollId",           request.RollId);
        cmd.Parameters.AddWithValue("@requiredQuantity", request.RequiredQuantity);
        cmd.Parameters.AddWithValue("@startTime",        request.StartTime);
        cmd.Parameters.AddWithValue("@endTime",          request.EndTime);

        await conn.OpenAsync();
        try
        {
            var rows = Convert.ToInt32(await cmd.ExecuteScalarAsync());
            if (rows == 0)
                throw new KeyNotFoundException("Shift not found.");
        }
        catch (SqlException ex) when (ex.Message.StartsWith("APPROVED_EXCEEDS_REQUIRED:"))
        {
            var parts = ex.Message.Split(':');
            var approved = parts.ElementAtOrDefault(1) ?? "?";
            var requested = parts.ElementAtOrDefault(2) ?? "?";
            throw new InvalidOperationException(
                $"Cannot reduce required quantity to {requested} — {approved} employee(s) are already approved. Cancel employees via the staffing tab first.");
        }
    }

    // ── Delete a shift (ownership-validated) ──────────────────────────────
    public async Task DeleteShiftAsync(string shiftId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_DeleteShift", conn)
            { CommandType = CommandType.StoredProcedure };

        cmd.Parameters.AddWithValue("@shiftId",     shiftId);
        cmd.Parameters.AddWithValue("@firebaseUid", firebaseUid);

        await conn.OpenAsync();
        var rows = Convert.ToInt32(await cmd.ExecuteScalarAsync());

        if (rows == 0)
            throw new KeyNotFoundException("Shift not found.");
    }

    // ── Create a shift for an event (with ownership check) ────────────────
    public async Task CreateEventShiftAsync(string eventId, string firebaseUid, CreateShiftRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RollId))
            throw new ArgumentException("Role is required.");
        if (request.RequiredQuantity < 1)
            throw new ArgumentException("Required quantity must be at least 1.");
        if (request.EndTime <= request.StartTime)
            throw new ArgumentException("End time must be after start time.");

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_CreateEventShift", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@shiftId",          Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("@eventId",          eventId);
        cmd.Parameters.AddWithValue("@firebaseUid",      firebaseUid);
        cmd.Parameters.AddWithValue("@rollId",           request.RollId);
        cmd.Parameters.AddWithValue("@requiredQuantity", request.RequiredQuantity);
        cmd.Parameters.AddWithValue("@startTime",        request.StartTime);
        cmd.Parameters.AddWithValue("@endTime",          request.EndTime);

        await conn.OpenAsync();
        var rows = Convert.ToInt32(await cmd.ExecuteScalarAsync());
        if (rows == 0)
            throw new KeyNotFoundException("Event not found.");
    }

    // ── Insert into Shift ──────────────────────────────────────────────────
    public async Task CreateShiftAsync(string eventId, CreateShiftRequest request)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_CreateShift", conn)
            { CommandType = CommandType.StoredProcedure };

        cmd.Parameters.AddWithValue("@shiftId",          Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("@eventId",          eventId);
        cmd.Parameters.AddWithValue("@rollId",           request.RollId);
        cmd.Parameters.AddWithValue("@requiredQuantity", request.RequiredQuantity);
        cmd.Parameters.AddWithValue("@startTime",        request.StartTime);
        cmd.Parameters.AddWithValue("@endTime",          request.EndTime);

        await conn.OpenAsync();
        await cmd.ExecuteNonQueryAsync();
    }

    // ── Shared: two-step access check ─────────────────────────────────────
    private async Task<bool?> CheckProjectAccessAsync(SqlConnection conn, string projId, string firebaseUid)
    {
        await using var cmd = new SqlCommand("sp_CheckProjectAccess", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@projId", projId);
        cmd.Parameters.AddWithValue("@fbUid",  firebaseUid);

        var result = await cmd.ExecuteScalarAsync();
        var access = result == null || result == DBNull.Value ? 0 : Convert.ToInt32(result);
        if (access == 0) return null;
        if (access == 2) throw new UnauthorizedAccessException("You do not have access to this project.");
        return true;
    }

    // ── GET tasks for a project ────────────────────────────────────────────
    public async Task<IEnumerable<TaskItem>?> GetTasksByProjectIdAsync(string projId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null) return null;

        var tasks = new List<TaskItem>();
        await using var cmd    = new SqlCommand("sp_GetProjectTasks", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@projId", projId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            tasks.Add(new TaskItem
            {
                TaskId   = reader.GetString(reader.GetOrdinal("task_ID")),
                Content  = reader.IsDBNull(reader.GetOrdinal("content"))  ? string.Empty : reader.GetString(reader.GetOrdinal("content")),
                Status   = reader.GetString(reader.GetOrdinal("status")),
                Priority = reader.GetString(reader.GetOrdinal("priority")),
            });
        }
        return tasks;
    }

    // ── CREATE task ────────────────────────────────────────────────────────
    public async Task<TaskItem?> CreateTaskAsync(string projId, CreateTaskRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null) return null;

        var newId = Guid.NewGuid().ToString();
        await using var cmd = new SqlCommand("sp_CreateProjectTask", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@taskId",   newId);
        cmd.Parameters.AddWithValue("@content",  request.Content);
        cmd.Parameters.AddWithValue("@status",   request.Status);
        cmd.Parameters.AddWithValue("@priority", request.Priority);
        cmd.Parameters.AddWithValue("@projId",   projId);
        await cmd.ExecuteNonQueryAsync();

        return new TaskItem
        {
            TaskId   = newId,
            Content  = request.Content,
            Status   = request.Status,
            Priority = request.Priority,
        };
    }

    // ── UPDATE task ────────────────────────────────────────────────────────
    public async Task<TaskItem?> UpdateTaskAsync(string taskId, string projId, UpdateTaskRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_UpdateProjectTask", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@content",  request.Content);
        cmd.Parameters.AddWithValue("@status",   request.Status);
        cmd.Parameters.AddWithValue("@priority", request.Priority);
        cmd.Parameters.AddWithValue("@taskId",   taskId);
        cmd.Parameters.AddWithValue("@projId",   projId);
        var rows = Convert.ToInt32(await cmd.ExecuteScalarAsync());
        if (rows == 0) return null;

        return new TaskItem
        {
            TaskId   = taskId,
            Content  = request.Content,
            Status   = request.Status,
            Priority = request.Priority,
        };
    }

    // ── DELETE task ────────────────────────────────────────────────────────
    public async Task<bool?> DeleteTaskAsync(string taskId, string projId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_DeleteProjectTask", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@taskId", taskId);
        cmd.Parameters.AddWithValue("@projId", projId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
    }

    // ── Helper: read BriefItem from open SqlDataReader ─────────────────────
    private static BriefItem ReadBriefItem(SqlDataReader r) => new()
    {
        BriefId              = r.GetString(r.GetOrdinal("brief_ID")),
        Title                = r.IsDBNull(r.GetOrdinal("title"))        ? string.Empty : r.GetString(r.GetOrdinal("title")),
        Content              = r.IsDBNull(r.GetOrdinal("content"))      ? string.Empty : r.GetString(r.GetOrdinal("content")),
        CreatedAt            = r.IsDBNull(r.GetOrdinal("created_at"))   ? (DateTime?)null : r.GetDateTime(r.GetOrdinal("created_at")),
        CreatedByManagerId   = r.IsDBNull(r.GetOrdinal("created_by_manager_user_ID")) ? string.Empty : r.GetString(r.GetOrdinal("created_by_manager_user_ID")),
        CreatedByManagerName = r.IsDBNull(r.GetOrdinal("manager_name")) ? null : r.GetString(r.GetOrdinal("manager_name")),
        AckCount             = r.IsDBNull(r.GetOrdinal("ack_count"))     ? 0 : r.GetInt32(r.GetOrdinal("ack_count")),
        TotalRelevant        = r.IsDBNull(r.GetOrdinal("total_relevant")) ? 0 : r.GetInt32(r.GetOrdinal("total_relevant")),
    };

    // ── GET briefs for a project ───────────────────────────────────────────
    public async Task<IEnumerable<BriefItem>?> GetBriefsByProjectIdAsync(string projId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null) return null;

        var briefs = new List<BriefItem>();
        await using var cmd    = new SqlCommand("sp_GetProjectBriefs", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@projId", projId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync()) briefs.Add(ReadBriefItem(reader));
        return briefs;
    }

    // ── CREATE brief ───────────────────────────────────────────────────────
    public async Task<BriefItem?> CreateBriefAsync(string projId, CreateBriefRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null) return null;

        var newId = Guid.NewGuid().ToString();
        var now   = DateTime.UtcNow;

        await using var cmd = new SqlCommand("sp_CreateProjectBrief", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@briefId",   newId);
        cmd.Parameters.AddWithValue("@title",     request.Title);
        cmd.Parameters.AddWithValue("@content",   request.Content);
        cmd.Parameters.AddWithValue("@createdAt", now);
        cmd.Parameters.AddWithValue("@firebaseUid", firebaseUid);
        cmd.Parameters.AddWithValue("@projId",    projId);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return ReadBriefItem(reader);
    }

    // ── UPDATE brief ───────────────────────────────────────────────────────
    public async Task<BriefItem?> UpdateBriefAsync(string briefId, string projId, UpdateBriefRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_UpdateProjectBrief", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@title",   request.Title);
        cmd.Parameters.AddWithValue("@content", request.Content);
        cmd.Parameters.AddWithValue("@briefId", briefId);
        cmd.Parameters.AddWithValue("@projId",  projId);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;
        return ReadBriefItem(reader);
    }

    // ── DELETE brief ───────────────────────────────────────────────────────
    public async Task<bool?> DeleteBriefAsync(string briefId, string projId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_DeleteProjectBrief", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@briefId", briefId);
        cmd.Parameters.AddWithValue("@projId",  projId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
    }

    // ── Employee Job Offers ────────────────────────────────────────────────
    public async Task<IEnumerable<JobOfferResponse>> GetJobOffersForEmployeeAsync(string firebaseUid)
    {
        var offers = new List<JobOfferResponse>();

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_GetJobOffersForEmployee", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@fbuid", firebaseUid);

        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            offers.Add(new JobOfferResponse
            {
                ShiftId          = reader["shift_ID"].ToString()!,
                Status           = reader["status"].ToString()!,
                StatusUpdatedAt  = reader["status_updated_at"] == DBNull.Value ? null : (DateTime?)reader["status_updated_at"],
                PayRatePerHour   = reader["pay_rate_per_hour"] == DBNull.Value ? null : (decimal?)reader["pay_rate_per_hour"],
                Notes            = reader["notes"] == DBNull.Value ? null : reader["notes"].ToString(),
                PlannedStartTime = reader["planned_start_time"] == DBNull.Value ? null : (DateTime?)reader["planned_start_time"],
                PlannedEndTime   = reader["planned_end_time"]   == DBNull.Value ? null : (DateTime?)reader["planned_end_time"],
                ShiftStartTime   = reader["shift_start_time"]   == DBNull.Value ? null : (DateTime?)reader["shift_start_time"],
                ShiftEndTime     = reader["shift_end_time"]     == DBNull.Value ? null : (DateTime?)reader["shift_end_time"],
                RoleName         = reader["Roll_name"].ToString()!,
                EventId          = reader["event_ID"].ToString()!,
                EventName        = reader["event_name"].ToString()!,
                EventLocation    = reader["event_location"] == DBNull.Value ? null : reader["event_location"].ToString(),
                EventType        = reader["event_type"]     == DBNull.Value ? null : reader["event_type"].ToString(),
                AttendeesCount   = reader["attendees_count"] == DBNull.Value ? null : (int?)reader["attendees_count"],
                ProjectName      = reader["project_name"].ToString()!,
                ManagerName      = reader["manager_name"].ToString()!,
            });
        }

        return offers;
    }

    public async Task<int> RespondToJobOfferAsync(string firebaseUid, string shiftId, bool accept)
    {
        var newStatus = accept ? "employee_request" : "employee_request_canceled";

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_RespondToJobOffer", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@newStatus", newStatus);
        cmd.Parameters.AddWithValue("@shiftId",   shiftId);
        cmd.Parameters.AddWithValue("@fbuid",      firebaseUid);

        await conn.OpenAsync();
        return Convert.ToInt32(await cmd.ExecuteScalarAsync());
    }

    // ── Potential Workers ──────────────────────────────────────────────────
    public async Task<IEnumerable<PotentialWorkerResponse>?> GetPotentialWorkersAsync(
        string projId, string eventId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null)
            return null;

        await using (var cmd = new SqlCommand("sp_EventBelongsToProject", conn)
            { CommandType = CommandType.StoredProcedure })
        {
            cmd.Parameters.AddWithValue("@eventId", eventId);
            cmd.Parameters.AddWithValue("@projId",  projId);
            if (Convert.ToInt32(await cmd.ExecuteScalarAsync()) == 0)
                return null;
        }

        var companyId = await GetManagerCompanyIdAsync(firebaseUid);
        if (companyId == null)
            return null;

        await using var workersCmd = new SqlCommand("sp_GetPotentialWorkers", conn)
            { CommandType = CommandType.StoredProcedure };
        workersCmd.Parameters.AddWithValue("@eventId",   eventId);
        workersCmd.Parameters.AddWithValue("@companyId", companyId);

        var workers = new Dictionary<string, PotentialWorkerResponse>();
        await using var reader = await workersCmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var userId = reader.GetString(reader.GetOrdinal("user_ID"));
            if (!workers.TryGetValue(userId, out var worker))
            {
                worker = new PotentialWorkerResponse
                {
                    UserId      = userId,
                    FbUid       = reader.IsDBNull(reader.GetOrdinal("FBUID")) ? "" : reader.GetString(reader.GetOrdinal("FBUID")),
                    FirstName   = reader.GetString(reader.GetOrdinal("firstName")),
                    LastName    = reader.GetString(reader.GetOrdinal("lastName")),
                    CostPerHour = reader.IsDBNull(reader.GetOrdinal("cost_per_hour")) ? null : reader.GetDecimal(reader.GetOrdinal("cost_per_hour")),
                    EligibleShifts = [],
                };
                workers[userId] = worker;
            }

            worker.EligibleShifts.Add(new EligibleShiftItem
            {
                ShiftId           = reader.GetString(reader.GetOrdinal("Shift_ID")),
                RoleId            = reader.GetString(reader.GetOrdinal("roll_ID")),
                RoleName          = reader.GetString(reader.GetOrdinal("Roll_name")),
                StartTime         = reader.IsDBNull(reader.GetOrdinal("start_time")) ? null : reader.GetDateTime(reader.GetOrdinal("start_time")),
                EndTime           = reader.IsDBNull(reader.GetOrdinal("end_time"))   ? null : reader.GetDateTime(reader.GetOrdinal("end_time")),
                RequiredQuantity  = reader.GetInt32(reader.GetOrdinal("required_quantity")),
                ActiveAssignments = reader.GetInt32(reader.GetOrdinal("ActiveAssignments")),
            });
        }

        return workers.Values.ToList();
    }

    public async Task SendOfferToEmployeeAsync(
        string projId, string eventId, string employeeFbUid,
        List<string> shiftIds, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null)
            throw new KeyNotFoundException("Project not found.");

        await using var cmd = new SqlCommand("sp_SendOfferToEmployee", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@projId",        projId);
        cmd.Parameters.AddWithValue("@eventId",       eventId);
        cmd.Parameters.AddWithValue("@employeeFbUid", employeeFbUid);
        cmd.Parameters.AddWithValue("@managerFbUid",  firebaseUid);
        cmd.Parameters.AddWithValue("@shiftIdsCsv",   string.Join(",", shiftIds));

        try
        {
            await cmd.ExecuteNonQueryAsync();
        }
        catch (SqlException ex) when (ex.Message.Contains("Event not found."))
        {
            throw new KeyNotFoundException("Event not found.", ex);
        }
        catch (SqlException ex) when (ex.Message.Contains("Employee not found"))
        {
            throw new UnauthorizedAccessException("Employee not found or not in your company.", ex);
        }
        catch (SqlException ex) when (ex.Message.Contains("shift IDs"))
        {
            throw new ArgumentException("One or more shift IDs do not belong to this event.", ex);
        }
    }

    // ── Get all assigned workers for an event, grouped by status ─────────
    public async Task<EventWorkersResponse> GetEventWorkersAsync(string eventId, string firebaseUid)
    {
        var result = new EventWorkersResponse();

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_GetEventWorkers", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@eventId",     eventId);
        cmd.Parameters.AddWithValue("@firebaseUid", firebaseUid);

        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();

        var ordShiftId           = reader.GetOrdinal("ShiftId");
        var ordUserId            = reader.GetOrdinal("UserId");
        var ordFbUid             = reader.GetOrdinal("FbUid");
        var ordFirstName         = reader.GetOrdinal("FirstName");
        var ordLastName          = reader.GetOrdinal("LastName");
        var ordRoleName          = reader.GetOrdinal("RoleName");
        var ordStatus            = reader.GetOrdinal("Status");
        var ordShiftStart        = reader.GetOrdinal("ShiftStart");
        var ordShiftEnd          = reader.GetOrdinal("ShiftEnd");
        var ordRequiredQuantity  = reader.GetOrdinal("RequiredQuantity");
        var ordCostPerHour       = reader.GetOrdinal("CostPerHour");
        var ordActiveAssignments = reader.GetOrdinal("ActiveAssignments");

        while (await reader.ReadAsync())
        {
            var item = new AssignedWorkerItem
            {
                ShiftId           = reader.IsDBNull(ordShiftId)           ? "" : reader.GetString(ordShiftId),
                UserId            = reader.IsDBNull(ordUserId)            ? "" : reader.GetString(ordUserId),
                FbUid             = reader.IsDBNull(ordFbUid)             ? "" : reader.GetString(ordFbUid),
                FirstName         = reader.IsDBNull(ordFirstName)         ? "" : reader.GetString(ordFirstName),
                LastName          = reader.IsDBNull(ordLastName)          ? "" : reader.GetString(ordLastName),
                RoleName          = reader.IsDBNull(ordRoleName)          ? "" : reader.GetString(ordRoleName),
                Status            = reader.IsDBNull(ordStatus)            ? "" : reader.GetString(ordStatus),
                ShiftStart        = reader.IsDBNull(ordShiftStart)        ? null : reader.GetDateTime(ordShiftStart),
                ShiftEnd          = reader.IsDBNull(ordShiftEnd)          ? null : reader.GetDateTime(ordShiftEnd),
                RequiredQuantity  = reader.IsDBNull(ordRequiredQuantity)  ? 0    : reader.GetInt32(ordRequiredQuantity),
                CostPerHour       = reader.IsDBNull(ordCostPerHour)       ? null : reader.GetDecimal(ordCostPerHour),
                ActiveAssignments = reader.IsDBNull(ordActiveAssignments) ? 0    : reader.GetInt32(ordActiveAssignments),
            };

            switch (item.Status)
            {
                case "manager_offer_sent":         result.Awaiting.Add(item);   break;
                case "employee_request":           result.Applicants.Add(item); break;
                case "manager_approved":           result.Approved.Add(item);   break;
                case "manager_hold":               result.Hold.Add(item);       break;
                case "manager_reject":
                case "manager_approved_canceled":
                case "employee_request_canceled":  result.Rejected.Add(item);   break;
            }
        }

        return result;
    }

    // ── Update status for a specific shift of an employee in an event ──────
    public async Task UpdateWorkerStatusAsync(
        string eventId, string employeeFbUid, string shiftId, string newStatus, string managerFbUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_UpdateWorkerStatus", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@newStatus",      newStatus);
        cmd.Parameters.AddWithValue("@shiftId",        shiftId);
        cmd.Parameters.AddWithValue("@employeeFbUid",  employeeFbUid);
        cmd.Parameters.AddWithValue("@eventId",        eventId);
        cmd.Parameters.AddWithValue("@managerFbUid",   managerFbUid);

        await conn.OpenAsync();
        int rowsAffected;
        try
        {
            rowsAffected = Convert.ToInt32(await cmd.ExecuteScalarAsync());
        }
        catch (SqlException ex) when (
            ex.Message.Contains("overlapping shift") ||
            ex.Message.Contains("already full"))
        {
            throw new InvalidOperationException(ex.Message);
        }
        if (rowsAffected == 0)
            throw new KeyNotFoundException("No matching assignment found for this shift.");
    }

    // ── Delete a specific Employee_Shift row (return one shift to pool) ────
    public async Task DeleteWorkerAssignmentAsync(
        string eventId, string employeeFbUid, string shiftId, string managerFbUid)
    {
        // Delete only the specific shift assignment for this employee.
        // If the employee still has other active shifts in the event they remain assigned
        // and correctly will NOT reappear in the potential workers pool.
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_DeleteWorkerAssignment", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@shiftId",       shiftId);
        cmd.Parameters.AddWithValue("@employeeFbUid", employeeFbUid);
        cmd.Parameters.AddWithValue("@eventId",       eventId);
        cmd.Parameters.AddWithValue("@managerFbUid",  managerFbUid);

        await conn.OpenAsync();
        var rowsAffected = Convert.ToInt32(await cmd.ExecuteScalarAsync());
        if (rowsAffected == 0)
            throw new KeyNotFoundException("No matching assignment found for this shift.");
    }

    // ── Employee's own applications (all active statuses except hold/offer) ─
    public async Task<IEnumerable<MyApplicationResponse>> GetMyApplicationsAsync(string firebaseUid)
    {
        var results = new List<MyApplicationResponse>();

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_GetMyApplications", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@firebaseUid", firebaseUid);

        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();

        var ordShiftId               = reader.GetOrdinal("ShiftId");
        var ordStatus                = reader.GetOrdinal("Status");
        var ordRoleName              = reader.GetOrdinal("RoleName");
        var ordEventId               = reader.GetOrdinal("EventId");
        var ordEventName             = reader.GetOrdinal("EventName");
        var ordEventLocation         = reader.GetOrdinal("EventLocation");
        var ordEventStart            = reader.GetOrdinal("EventStart");
        var ordEventEnd              = reader.GetOrdinal("EventEnd");
        var ordShiftStart            = reader.GetOrdinal("ShiftStart");
        var ordShiftEnd              = reader.GetOrdinal("ShiftEnd");
        var ordProjectId             = reader.GetOrdinal("ProjectId");
        var ordProjectName           = reader.GetOrdinal("ProjectName");
        var ordActualStart           = reader.GetOrdinal("ActualStart");
        var ordActualEnd             = reader.GetOrdinal("ActualEnd");
        var ordPayRate               = reader.GetOrdinal("PayRatePerHour");
        var ordApprovedRegular       = reader.GetOrdinal("ApprovedRegularHours");
        var ordApprovedOvertime      = reader.GetOrdinal("ApprovedOvertimeHours");
        var ordPaymentStatus         = reader.GetOrdinal("PaymentStatus");

        while (await reader.ReadAsync())
        {
            results.Add(new MyApplicationResponse
            {
                ShiftId               = reader.IsDBNull(ordShiftId)          ? "" : reader.GetString(ordShiftId),
                Status                = reader.IsDBNull(ordStatus)           ? "" : reader.GetString(ordStatus),
                RoleName              = reader.IsDBNull(ordRoleName)         ? "" : reader.GetString(ordRoleName),
                EventId               = reader.IsDBNull(ordEventId)          ? "" : reader.GetString(ordEventId),
                EventName             = reader.IsDBNull(ordEventName)        ? "" : reader.GetString(ordEventName),
                EventLocation         = reader.IsDBNull(ordEventLocation)    ? null : reader.GetString(ordEventLocation),
                EventStart            = reader.IsDBNull(ordEventStart)       ? null : reader.GetDateTime(ordEventStart),
                EventEnd              = reader.IsDBNull(ordEventEnd)         ? null : reader.GetDateTime(ordEventEnd),
                ShiftStart            = reader.IsDBNull(ordShiftStart)       ? null : reader.GetDateTime(ordShiftStart),
                ShiftEnd              = reader.IsDBNull(ordShiftEnd)         ? null : reader.GetDateTime(ordShiftEnd),
                ProjectId             = reader.IsDBNull(ordProjectId)        ? "" : reader.GetString(ordProjectId),
                ProjectName           = reader.IsDBNull(ordProjectName)      ? "" : reader.GetString(ordProjectName),
                ActualStart           = reader.IsDBNull(ordActualStart)      ? null : reader.GetDateTime(ordActualStart),
                ActualEnd             = reader.IsDBNull(ordActualEnd)        ? null : reader.GetDateTime(ordActualEnd),
                PayRatePerHour        = reader.IsDBNull(ordPayRate)          ? null : reader.GetDecimal(ordPayRate),
                ApprovedRegularHours  = reader.IsDBNull(ordApprovedRegular)  ? null : reader.GetDecimal(ordApprovedRegular),
                ApprovedOvertimeHours = reader.IsDBNull(ordApprovedOvertime) ? null : reader.GetDecimal(ordApprovedOvertime),
                PaymentStatus         = reader.IsDBNull(ordPaymentStatus)    ? "" : reader.GetString(ordPaymentStatus),
            });
        }

        return results;
    }

    public async Task<bool> ReportHoursAsync(string firebaseUid, string shiftId, DateTime? actualStart, DateTime? actualEnd)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_ReportHours", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@shiftId",     shiftId);
        cmd.Parameters.AddWithValue("@fbuid",        firebaseUid);
        cmd.Parameters.AddWithValue("@actualStart",  (object?)actualStart ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@actualEnd",    (object?)actualEnd   ?? DBNull.Value);

        await conn.OpenAsync();
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  EVENT-SCOPED HELPERS
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>Returns the project_ID if the manager's company has access to the event; null otherwise.</summary>
    private async Task<string?> CheckEventAccessAsync(SqlConnection conn, string eventId, string firebaseUid)
    {
        await using var cmd = new SqlCommand("sp_CheckEventAccess", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@eventId", eventId);
        cmd.Parameters.AddWithValue("@fbUid",   firebaseUid);
        return (string?)await cmd.ExecuteScalarAsync();
    }

    private async Task<string?> GetUserIdByFbUidAsync(SqlConnection conn, string firebaseUid)
    {
        await using var cmd = new SqlCommand("sp_GetUserIdByFbUid", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@fbUid", firebaseUid);
        return (string?)await cmd.ExecuteScalarAsync();
    }

    // ── Event Tasks ────────────────────────────────────────────────────────

    public async Task<IEnumerable<TaskItem>?> GetTasksByEventIdAsync(string eventId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        var tasks = new List<TaskItem>();
        await using var cmd    = new SqlCommand("sp_GetEventTasks", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@eventId", eventId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            tasks.Add(new TaskItem {
                TaskId   = reader.GetString(reader.GetOrdinal("task_ID")),
                Content  = reader.IsDBNull(reader.GetOrdinal("content"))  ? "" : reader.GetString(reader.GetOrdinal("content")),
                Status   = reader.GetString(reader.GetOrdinal("status")),
                Priority = reader.GetString(reader.GetOrdinal("priority")),
            });
        return tasks;
    }

    public async Task<TaskItem?> CreateEventTaskAsync(string eventId, CreateTaskRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        var newId = Guid.NewGuid().ToString();
        await using var cmd = new SqlCommand("sp_CreateEventTask", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@taskId",   newId);
        cmd.Parameters.AddWithValue("@content",  request.Content);
        cmd.Parameters.AddWithValue("@status",   request.Status);
        cmd.Parameters.AddWithValue("@priority", request.Priority);
        cmd.Parameters.AddWithValue("@eventId",  eventId);
        await cmd.ExecuteNonQueryAsync();
        return new TaskItem { TaskId = newId, Content = request.Content, Status = request.Status, Priority = request.Priority };
    }

    public async Task<TaskItem?> UpdateEventTaskAsync(string taskId, string eventId, UpdateTaskRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_UpdateEventTask", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@content",  request.Content);
        cmd.Parameters.AddWithValue("@status",   request.Status);
        cmd.Parameters.AddWithValue("@priority", request.Priority);
        cmd.Parameters.AddWithValue("@taskId",   taskId);
        cmd.Parameters.AddWithValue("@eventId",  eventId);
        var rows = Convert.ToInt32(await cmd.ExecuteScalarAsync());
        if (rows == 0) return null;
        return new TaskItem { TaskId = taskId, Content = request.Content, Status = request.Status, Priority = request.Priority };
    }

    public async Task<bool?> DeleteEventTaskAsync(string taskId, string eventId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_DeleteEventTask", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@taskId",  taskId);
        cmd.Parameters.AddWithValue("@eventId", eventId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
    }

    // ── Event Briefs ───────────────────────────────────────────────────────

    public async Task<IEnumerable<BriefItem>?> GetBriefsByEventIdAsync(string eventId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        var briefs = new List<BriefItem>();
        await using var cmd    = new SqlCommand("sp_GetEventBriefs", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@eventId", eventId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync()) briefs.Add(ReadBriefItem(reader));
        return briefs;
    }

    public async Task<BriefItem?> CreateEventBriefAsync(string eventId, CreateBriefRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        var newId = Guid.NewGuid().ToString();
        await using var cmd = new SqlCommand("sp_CreateEventBrief", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@briefId",   newId);
        cmd.Parameters.AddWithValue("@title",     request.Title);
        cmd.Parameters.AddWithValue("@content",   request.Content);
        cmd.Parameters.AddWithValue("@createdAt", DateTime.UtcNow);
        cmd.Parameters.AddWithValue("@firebaseUid", firebaseUid);
        cmd.Parameters.AddWithValue("@eventId",   eventId);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return ReadBriefItem(reader);
    }

    public async Task<BriefItem?> UpdateEventBriefAsync(string briefId, string eventId, UpdateBriefRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_UpdateEventBrief", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@title",   request.Title);
        cmd.Parameters.AddWithValue("@content", request.Content);
        cmd.Parameters.AddWithValue("@briefId", briefId);
        cmd.Parameters.AddWithValue("@eventId", eventId);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;
        return ReadBriefItem(reader);
    }

    public async Task<bool?> DeleteEventBriefAsync(string briefId, string eventId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_DeleteEventBrief", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@briefId", briefId);
        cmd.Parameters.AddWithValue("@eventId", eventId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
    }

    // ── Event Expenses ─────────────────────────────────────────────────────

    private static EventExpenseItem ReadExpense(SqlDataReader r) => new()
    {
        ExpenseId            = r.GetString(r.GetOrdinal("expense_ID")),
        EventId              = r.IsDBNull(r.GetOrdinal("event_ID"))              ? "" : r.GetString(r.GetOrdinal("event_ID")),
        ExpenseType          = r.GetString(r.GetOrdinal("expense_type")),
        Description          = r.IsDBNull(r.GetOrdinal("description"))           ? null : r.GetString(r.GetOrdinal("description")),
        Amount               = r.IsDBNull(r.GetOrdinal("amount"))                ? null : r.GetDecimal(r.GetOrdinal("amount")),
        ExpenseDate          = r.IsDBNull(r.GetOrdinal("expense_date"))          ? null : r.GetDateTime(r.GetOrdinal("expense_date")),
        VendorName           = r.IsDBNull(r.GetOrdinal("vendor_name"))           ? null : r.GetString(r.GetOrdinal("vendor_name")),
        Notes                = r.IsDBNull(r.GetOrdinal("notes"))                 ? null : r.GetString(r.GetOrdinal("notes")),
        CreatedByManagerId   = r.IsDBNull(r.GetOrdinal("created_by_manager_user_ID")) ? null : r.GetString(r.GetOrdinal("created_by_manager_user_ID")),
        CreatedByManagerName = r.IsDBNull(r.GetOrdinal("manager_name"))          ? null : r.GetString(r.GetOrdinal("manager_name")),
    };

    public async Task<IEnumerable<EventExpenseItem>?> GetEventExpensesAsync(string eventId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        var list = new List<EventExpenseItem>();
        await using var cmd = new SqlCommand("sp_GetEventExpenses", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@eventId", eventId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync()) list.Add(ReadExpense(reader));
        return list;
    }

    public async Task<EventExpenseItem?> CreateEventExpenseAsync(string eventId, CreateExpenseRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        var newId = Guid.NewGuid().ToString();
        await using var cmd = new SqlCommand("sp_CreateEventExpense", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@expenseId",  newId);
        cmd.Parameters.AddWithValue("@eventId",    eventId);
        cmd.Parameters.AddWithValue("@type",       request.ExpenseType);
        cmd.Parameters.AddWithValue("@desc",       (object?)request.Description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@amount",     (object?)request.Amount       ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@date",       (object?)request.ExpenseDate  ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@vendor",     (object?)request.VendorName   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@firebaseUid", firebaseUid);
        cmd.Parameters.AddWithValue("@notes",      (object?)request.Notes        ?? DBNull.Value);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return ReadExpense(reader);
    }

    public async Task<EventExpenseItem?> UpdateEventExpenseAsync(string expenseId, string eventId, UpdateExpenseRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_UpdateEventExpense", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@expenseId", expenseId);
        cmd.Parameters.AddWithValue("@eventId",   eventId);
        cmd.Parameters.AddWithValue("@type",      request.ExpenseType);
        cmd.Parameters.AddWithValue("@desc",      (object?)request.Description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@amount",    (object?)request.Amount       ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@date",      (object?)request.ExpenseDate  ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@vendor",    (object?)request.VendorName   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@notes",     (object?)request.Notes        ?? DBNull.Value);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;
        return ReadExpense(reader);
    }

    public async Task<bool?> DeleteEventExpenseAsync(string expenseId, string eventId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_DeleteEventExpense", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@expenseId", expenseId);
        cmd.Parameters.AddWithValue("@eventId",   eventId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
    }

    // ── Event Payroll (Employee_Shift hours) ───────────────────────────────

    private static DateTime Utc(SqlDataReader r, int ord) =>
        DateTime.SpecifyKind(r.GetDateTime(ord), DateTimeKind.Utc);

    private static DateTime LocalWallTime(SqlDataReader r, int ord) =>
        DateTime.SpecifyKind(r.GetDateTime(ord), DateTimeKind.Unspecified);

    private static PayrollItem ReadPayrollItem(SqlDataReader reader) => new()
    {
        EmployeeUserId          = reader.IsDBNull(reader.GetOrdinal("EmployeeUserId"))         ? "" : reader.GetString(reader.GetOrdinal("EmployeeUserId")),
        EmployeeFbUid           = reader.IsDBNull(reader.GetOrdinal("EmployeeFbUid"))          ? "" : reader.GetString(reader.GetOrdinal("EmployeeFbUid")),
        FirstName               = reader.IsDBNull(reader.GetOrdinal("FirstName"))              ? "" : reader.GetString(reader.GetOrdinal("FirstName")),
        LastName                = reader.IsDBNull(reader.GetOrdinal("LastName"))               ? "" : reader.GetString(reader.GetOrdinal("LastName")),
        ShiftId                 = reader.IsDBNull(reader.GetOrdinal("ShiftId"))                ? "" : reader.GetString(reader.GetOrdinal("ShiftId")),
        RoleName                = reader.IsDBNull(reader.GetOrdinal("RoleName"))               ? "" : reader.GetString(reader.GetOrdinal("RoleName")),
        ShiftStart              = reader.IsDBNull(reader.GetOrdinal("ShiftStart"))             ? null : LocalWallTime(reader, reader.GetOrdinal("ShiftStart")),
        ShiftEnd                = reader.IsDBNull(reader.GetOrdinal("ShiftEnd"))               ? null : LocalWallTime(reader, reader.GetOrdinal("ShiftEnd")),
        ActualStart             = reader.IsDBNull(reader.GetOrdinal("ActualStart"))            ? null : Utc(reader, reader.GetOrdinal("ActualStart")),
        ActualEnd               = reader.IsDBNull(reader.GetOrdinal("ActualEnd"))              ? null : Utc(reader, reader.GetOrdinal("ActualEnd")),
        ShiftBulkStart          = reader.IsDBNull(reader.GetOrdinal("ShiftBulkStart"))         ? null : LocalWallTime(reader, reader.GetOrdinal("ShiftBulkStart")),
        ShiftBulkEnd            = reader.IsDBNull(reader.GetOrdinal("ShiftBulkEnd"))           ? null : LocalWallTime(reader, reader.GetOrdinal("ShiftBulkEnd")),
        ManagerOverrideStart    = reader.IsDBNull(reader.GetOrdinal("ManagerOverrideStart"))   ? null : LocalWallTime(reader, reader.GetOrdinal("ManagerOverrideStart")),
        ManagerOverrideEnd      = reader.IsDBNull(reader.GetOrdinal("ManagerOverrideEnd"))     ? null : LocalWallTime(reader, reader.GetOrdinal("ManagerOverrideEnd")),
        HoursSource             = reader.IsDBNull(reader.GetOrdinal("HoursSource"))            ? "none" : reader.GetString(reader.GetOrdinal("HoursSource")),
        ApprovedRegularHours    = reader.IsDBNull(reader.GetOrdinal("ApprovedRegularHours"))   ? null : reader.GetDecimal(reader.GetOrdinal("ApprovedRegularHours")),
        ApprovedOvertimeHours   = reader.IsDBNull(reader.GetOrdinal("ApprovedOvertimeHours"))  ? null : reader.GetDecimal(reader.GetOrdinal("ApprovedOvertimeHours")),
        ApprovedAt              = reader.IsDBNull(reader.GetOrdinal("ApprovedAt"))             ? null : Utc(reader, reader.GetOrdinal("ApprovedAt")),
        ApprovedByManagerUserId = reader.IsDBNull(reader.GetOrdinal("ApprovedByManagerUserId"))? null : reader.GetString(reader.GetOrdinal("ApprovedByManagerUserId")),
        PayRatePerHour          = reader.IsDBNull(reader.GetOrdinal("PayRatePerHour"))         ? null : reader.GetDecimal(reader.GetOrdinal("PayRatePerHour")),
        DefaultPayRate          = reader.IsDBNull(reader.GetOrdinal("DefaultPayRate"))         ? null : reader.GetDecimal(reader.GetOrdinal("DefaultPayRate")),
        OvertimeRatePerHour     = reader.IsDBNull(reader.GetOrdinal("OvertimeRatePerHour"))    ? null : reader.GetDecimal(reader.GetOrdinal("OvertimeRatePerHour")),
        TravelRefund            = reader.IsDBNull(reader.GetOrdinal("TravelRefund"))           ? null : reader.GetDecimal(reader.GetOrdinal("TravelRefund")),
        BonusAmount             = reader.IsDBNull(reader.GetOrdinal("BonusAmount"))            ? null : reader.GetDecimal(reader.GetOrdinal("BonusAmount")),
        PenaltyAmount           = reader.IsDBNull(reader.GetOrdinal("PenaltyAmount"))          ? null : reader.GetDecimal(reader.GetOrdinal("PenaltyAmount")),
        PaymentStatus           = reader.IsDBNull(reader.GetOrdinal("PaymentStatus"))          ? "pending" : reader.GetString(reader.GetOrdinal("PaymentStatus")),
        Status                  = reader.IsDBNull(reader.GetOrdinal("Status"))                 ? "" : reader.GetString(reader.GetOrdinal("Status")),
    };

    public async Task<IEnumerable<PayrollItem>?> GetEventPayrollAsync(string eventId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        var list = new List<PayrollItem>();
        await using var cmd = new SqlCommand("sp_GetEventPayroll", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@eventId", eventId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync()) list.Add(ReadPayrollItem(reader));
        return list;
    }

    private async Task<PayrollItem?> RefetchPayrollItemAsync(SqlConnection conn, string shiftId, string employeeUserId)
    {
        await using var cmd = new SqlCommand("sp_GetPayrollItem", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@shiftId",        shiftId);
        cmd.Parameters.AddWithValue("@employeeUserId", employeeUserId);
        await using var reader = await cmd.ExecuteReaderAsync();
        return await reader.ReadAsync() ? ReadPayrollItem(reader) : null;
    }

    public async Task<PayrollItem?> ApproveHoursAsync(string shiftId, string employeeUserId, string eventId, ApproveHoursRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        // Resolve manager's internal user_ID from their Firebase UID
        var managerUserId = await GetUserIdByFbUidAsync(conn, firebaseUid);
        if (managerUserId == null) return null;
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_ApproveHours", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@shiftId",        shiftId);
        cmd.Parameters.AddWithValue("@employeeUserId", employeeUserId);
        cmd.Parameters.AddWithValue("@regularHours",  (object?)request.ApprovedRegularHours  ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@overtimeHours", (object?)request.ApprovedOvertimeHours ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@managerId",     managerUserId);
        await using var reader = await cmd.ExecuteReaderAsync();
        return await reader.ReadAsync() ? ReadPayrollItem(reader) : null;
    }

    public async Task<PayrollItem?> SavePayrollAsync(string shiftId, string employeeUserId, string eventId, SavePayrollRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_SavePayroll", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@shiftId",        shiftId);
        cmd.Parameters.AddWithValue("@employeeUserId", employeeUserId);
        cmd.Parameters.AddWithValue("@payRate",        (object?)request.PayRatePerHour       ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@overtimeRate",   (object?)request.OvertimeRatePerHour  ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@travel",         (object?)request.TravelRefund         ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@bonus",          (object?)request.BonusAmount          ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@penalty",        (object?)request.PenaltyAmount        ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@paymentStatus",  request.PaymentStatus);
        await using var reader = await cmd.ExecuteReaderAsync();
        return await reader.ReadAsync() ? ReadPayrollItem(reader) : null;
    }

    // kept for backward-compat
    public async Task<PayrollItem?> UpdatePayrollAsync(string shiftId, string employeeUserId, string eventId, UpdatePayrollRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_SavePayroll", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@shiftId",        shiftId);
        cmd.Parameters.AddWithValue("@employeeUserId", employeeUserId);
        cmd.Parameters.AddWithValue("@payRate",        (object?)request.PayRatePerHour       ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@overtimeRate",   (object?)request.OvertimeRatePerHour  ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@travel",         (object?)request.TravelRefund         ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@bonus",          (object?)request.BonusAmount          ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@penalty",        (object?)request.PenaltyAmount        ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@paymentStatus",  request.PaymentStatus);
        await using var reader = await cmd.ExecuteReaderAsync();
        return await reader.ReadAsync() ? ReadPayrollItem(reader) : null;
    }

    // ── Bulk shift hours (manager sets one start/end for all employees in a shift) ──

    public async Task<bool> SetShiftBulkHoursAsync(string shiftId, BulkShiftHoursRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var resolveCmd = new SqlCommand("sp_GetEventIdByShift", conn)
            { CommandType = CommandType.StoredProcedure };
        resolveCmd.Parameters.AddWithValue("@shiftId", shiftId);
        var rawEventId = await resolveCmd.ExecuteScalarAsync();
        if (rawEventId == null) return false;
        var eventId = rawEventId.ToString()!;

        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return false;

        var managerUserId = await GetUserIdByFbUidAsync(conn, firebaseUid);
        await using var cmd = new SqlCommand("sp_SetShiftBulkHours", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@shiftId",   shiftId);
        cmd.Parameters.AddWithValue("@bulkStart", (object?)request.BulkActualStart ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@bulkEnd",   (object?)request.BulkActualEnd   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@managerId", (object?)managerUserId           ?? DBNull.Value);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
    }

    // ── Manager per-employee hours override ───────────────────────────────────

    public async Task<PayrollItem?> SetEmployeeHoursOverrideAsync(
        string shiftId, string employeeUserId, string eventId,
        ManagerOverrideHoursRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_SetEmployeeHoursOverride", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@shiftId",        shiftId);
        cmd.Parameters.AddWithValue("@employeeUserId", employeeUserId);
        cmd.Parameters.AddWithValue("@eventId",        eventId);
        cmd.Parameters.AddWithValue("@clearOverride",  request.ClearOverride);
        cmd.Parameters.AddWithValue("@managerStart",   (object?)request.ManagerActualStart ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@managerEnd",     (object?)request.ManagerActualEnd   ?? DBNull.Value);
        await using var reader = await cmd.ExecuteReaderAsync();
        return await reader.ReadAsync() ? ReadPayrollItem(reader) : null;
    }

    // ── Brief Acknowledgment ───────────────────────────────────────────────

    public async Task<IEnumerable<AcknowledgmentItem>?> GetBriefAcknowledgmentsAsync(string briefId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        await using (var accessCmd = new SqlCommand("sp_CheckBriefAccess", conn)
            { CommandType = CommandType.StoredProcedure })
        {
            accessCmd.Parameters.AddWithValue("@briefId", briefId);
            accessCmd.Parameters.AddWithValue("@fbUid",   firebaseUid);
            if (Convert.ToInt32(await accessCmd.ExecuteScalarAsync()) == 0)
                return null;
        }

        await using var cmd = new SqlCommand("sp_GetBriefAcknowledgments", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@briefId", briefId);
        cmd.Parameters.AddWithValue("@fbUid",   firebaseUid);

        var list = new List<AcknowledgmentItem>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            list.Add(new AcknowledgmentItem
            {
                EmployeeUserId = reader.GetString(reader.GetOrdinal("EmployeeUserId")),
                FirstName      = reader.IsDBNull(reader.GetOrdinal("FirstName")) ? "" : reader.GetString(reader.GetOrdinal("FirstName")),
                LastName       = reader.IsDBNull(reader.GetOrdinal("LastName"))  ? "" : reader.GetString(reader.GetOrdinal("LastName")),
                IsRead         = Convert.ToBoolean(reader.GetValue(reader.GetOrdinal("IsRead"))),
                ReadAt         = reader.IsDBNull(reader.GetOrdinal("ReadAt")) ? null : reader.GetDateTime(reader.GetOrdinal("ReadAt")),
            });
        return list;
    }

    public async Task<IEnumerable<AcknowledgmentItem>?> GetProjectBriefAcknowledgmentsAsync(string projId, string briefId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        await using (var accessCmd = new SqlCommand("sp_CheckProjectBriefAccess", conn)
            { CommandType = CommandType.StoredProcedure })
        {
            accessCmd.Parameters.AddWithValue("@projId",  projId);
            accessCmd.Parameters.AddWithValue("@briefId", briefId);
            accessCmd.Parameters.AddWithValue("@fbUid",   firebaseUid);
            if (Convert.ToInt32(await accessCmd.ExecuteScalarAsync()) == 0)
                return null;
        }

        await using var cmd = new SqlCommand("sp_GetProjectBriefAcknowledgments", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@projId",  projId);
        cmd.Parameters.AddWithValue("@briefId", briefId);
        cmd.Parameters.AddWithValue("@fbUid",   firebaseUid);

        var list = new List<AcknowledgmentItem>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            list.Add(new AcknowledgmentItem
            {
                EmployeeUserId = reader.GetString(reader.GetOrdinal("EmployeeUserId")),
                FirstName      = reader.IsDBNull(reader.GetOrdinal("FirstName")) ? "" : reader.GetString(reader.GetOrdinal("FirstName")),
                LastName       = reader.IsDBNull(reader.GetOrdinal("LastName"))  ? "" : reader.GetString(reader.GetOrdinal("LastName")),
                IsRead         = Convert.ToBoolean(reader.GetValue(reader.GetOrdinal("IsRead"))),
                ReadAt         = reader.IsDBNull(reader.GetOrdinal("ReadAt")) ? null : reader.GetDateTime(reader.GetOrdinal("ReadAt")),
            });
        return list;
    }

    public async Task<bool> AcknowledgeBriefAsync(string briefId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_AcknowledgeBrief", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@briefId", briefId);
        cmd.Parameters.AddWithValue("@fbUid",   firebaseUid);
        await conn.OpenAsync();
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
    }

    public async Task<IEnumerable<EmployeeBriefItem>?> GetBriefsForEmployeeAsync(string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_GetBriefsForEmployee", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@fbUid", firebaseUid);
        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();

        var list = new List<EmployeeBriefItem>();
        while (await reader.ReadAsync())
            list.Add(new EmployeeBriefItem
            {
                BriefId        = reader.GetString(reader.GetOrdinal("brief_ID")),
                Title          = reader.IsDBNull(reader.GetOrdinal("title"))       ? "" : reader.GetString(reader.GetOrdinal("title")),
                Content        = reader.IsDBNull(reader.GetOrdinal("content"))     ? "" : reader.GetString(reader.GetOrdinal("content")),
                CreatedAt      = reader.IsDBNull(reader.GetOrdinal("created_at"))  ? null : reader.GetDateTime(reader.GetOrdinal("created_at")),
                ProjectId      = reader.IsDBNull(reader.GetOrdinal("project_ID"))  ? null : reader.GetString(reader.GetOrdinal("project_ID")),
                EventId        = reader.IsDBNull(reader.GetOrdinal("event_ID"))    ? null : reader.GetString(reader.GetOrdinal("event_ID")),
                ShiftId        = reader.IsDBNull(reader.GetOrdinal("shift_ID"))    ? null : reader.GetString(reader.GetOrdinal("shift_ID")),
                ProjectName    = reader.IsDBNull(reader.GetOrdinal("ProjectName")) ? null : reader.GetString(reader.GetOrdinal("ProjectName")),
                EventName      = reader.IsDBNull(reader.GetOrdinal("EventName"))   ? null : reader.GetString(reader.GetOrdinal("EventName")),
                IsAcknowledged = reader.GetBoolean(reader.GetOrdinal("IsAcknowledged")),
                AcknowledgedAt = reader.IsDBNull(reader.GetOrdinal("AcknowledgedAt")) ? null : reader.GetDateTime(reader.GetOrdinal("AcknowledgedAt")),
            });
        return list;
    }

    // ── Auto-Assign: score all 'employee_request' candidates and assign the best ones ──
    public async Task<AutoAssignResult> AutoAssignShiftAsync(string shiftId, string managerFbUid)
    {
        int requiredQty;
        DateTime? shiftStart, shiftEnd;
        string roleName;

        await using (var conn = new SqlConnection(_connectionString))
        await using (var cmd  = new SqlCommand("sp_GetAutoAssignShift", conn)
            { CommandType = CommandType.StoredProcedure })
        {
            cmd.Parameters.AddWithValue("@shiftId",      shiftId);
            cmd.Parameters.AddWithValue("@managerFbUid", managerFbUid);
            await conn.OpenAsync();
            await using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                throw new KeyNotFoundException("Shift not found or you do not have access.");

            requiredQty = reader.GetInt32(reader.GetOrdinal("required_quantity"));
            shiftStart  = reader.IsDBNull(reader.GetOrdinal("start_time")) ? null : reader.GetDateTime(reader.GetOrdinal("start_time"));
            shiftEnd    = reader.IsDBNull(reader.GetOrdinal("end_time"))   ? null : reader.GetDateTime(reader.GetOrdinal("end_time"));
            roleName    = reader.IsDBNull(reader.GetOrdinal("RoleName")) ? "" : reader.GetString(reader.GetOrdinal("RoleName"));
        }

        int alreadyApproved;
        await using (var conn = new SqlConnection(_connectionString))
        await using (var cmd  = new SqlCommand("sp_GetAutoAssignApprovedCount", conn)
            { CommandType = CommandType.StoredProcedure })
        {
            cmd.Parameters.AddWithValue("@shiftId", shiftId);
            await conn.OpenAsync();
            alreadyApproved = (int)(await cmd.ExecuteScalarAsync() ?? 0);
        }

        int remainingSlots = requiredQty - alreadyApproved;

        // Raw data row used only inside this method for scoring
        var candidates = new List<(string UserId, string FbUid, string FirstName, string LastName, double CostPerHour, int RegisteredShifts, int OfferedShifts, double AttendanceAccuracy, double RoleFitScore)>();

        await using (var conn = new SqlConnection(_connectionString))
        await using (var cmd  = new SqlCommand("sp_GetAutoAssignCandidates", conn)
            { CommandType = CommandType.StoredProcedure })
        {
            cmd.Parameters.AddWithValue("@shiftId", shiftId);
            await conn.OpenAsync();
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                candidates.Add((
                    UserId:              reader.GetString(reader.GetOrdinal("UserId")),
                    FbUid:               reader.IsDBNull(reader.GetOrdinal("FbUid")) ? "" : reader.GetString(reader.GetOrdinal("FbUid")),
                    FirstName:           reader.IsDBNull(reader.GetOrdinal("FirstName")) ? "" : reader.GetString(reader.GetOrdinal("FirstName")),
                    LastName:            reader.IsDBNull(reader.GetOrdinal("LastName")) ? "" : reader.GetString(reader.GetOrdinal("LastName")),
                    CostPerHour:         Convert.ToDouble(reader["CostPerHour"]),
                    RegisteredShifts:    reader.GetInt32(reader.GetOrdinal("RegisteredShifts")),
                    OfferedShifts:       reader.GetInt32(reader.GetOrdinal("OfferedShifts")),
                    AttendanceAccuracy:  Convert.ToDouble(reader["AttendanceAccuracy"]),
                    RoleFitScore:        Convert.ToDouble(reader["RoleFitScore"])
                ));
            }
        }

        if (candidates.Count == 0)
            return new AutoAssignResult
            {
                ShiftId         = shiftId,
                RoleName        = roleName,
                ShiftStart      = shiftStart,
                ShiftEnd        = shiftEnd,
                Required        = requiredQty,
                AlreadyApproved = alreadyApproved,
                Assigned        = 0,
                Standby         = 0,
                Warning         = "No applicants found for this shift."
            };

        // Step 4: Score each candidate (all sub-scores normalised 0–1)
        // Helper: normalize a list of raw values to 0-1 range
        double[] Normalize(double[] values, bool invertHighIsBad)
        {
            double min = values.Min();
            double max = values.Max();
            double range = max - min;

            return values.Select(v =>
            {
                double normalized = range == 0 ? 0.5 : (v - min) / range;
                return invertHighIsBad ? 1.0 - normalized : normalized;
            }).ToArray();
        }

        double[] commitmentRaw         = candidates.Select(c => c.OfferedShifts == 0 ? 0.5 : (double)c.RegisteredShifts / c.OfferedShifts).ToArray();
        double[] attendanceAccuracyRaw = candidates.Select(c => c.AttendanceAccuracy).ToArray();  // lower = better
        double[] roleFitRaw            = candidates.Select(c => c.RoleFitScore).ToArray();
        double[] costRaw               = candidates.Select(c => c.CostPerHour).ToArray();          // lower = better

        double[] commitmentScore       = Normalize(commitmentRaw,         invertHighIsBad: false);
        double[] attendanceScore       = Normalize(attendanceAccuracyRaw, invertHighIsBad: true);   // invert: fewer minutes late = better
        double[] roleFitScore          = Normalize(roleFitRaw,            invertHighIsBad: false);
        double[] costScore             = Normalize(costRaw,               invertHighIsBad: true);   // invert: lower cost = better

        var scored = candidates
            .Select((c, i) => new
            {
                c.UserId,
                c.FbUid,
                c.FirstName,
                c.LastName,
                c.CostPerHour,
                CommitmentRate = commitmentRaw[i],
                CommitmentScore = commitmentScore[i],
                AttendanceMinutesLateAvg = attendanceAccuracyRaw[i],
                AttendanceScore = attendanceScore[i],
                RoleExperienceRate = roleFitRaw[i],
                RoleFitScore = roleFitScore[i],
                CostScore = costScore[i],
                Score = commitmentScore[i]  * 0.25
                      + attendanceScore[i]  * 0.30
                      + roleFitScore[i]     * 0.20
                      + costScore[i]        * 0.25
            })
            .OrderByDescending(x => x.Score)
            .ToList();

        // Step 5: Split into auto-assigned (top N) vs standby (the rest)
        var toApprove = scored.Take(remainingSlots > 0 ? remainingSlots : 0).Select(x => x.UserId).ToList();
        var toStandby = scored.Skip(remainingSlots > 0 ? remainingSlots : 0).Select(x => x.UserId).ToList();

        // Also move anyone who was already interested but got displaced (remainingSlots <= 0) to standby
        if (remainingSlots <= 0)
        {
            toStandby = scored.Select(x => x.UserId).ToList();
            toApprove.Clear();
        }

        var approvedSet = toApprove.ToHashSet();
        var decisions = scored.Select((x, i) => new AutoAssignWorkerDecision
        {
            UserId                   = x.UserId,
            FbUid                    = x.FbUid,
            FirstName                = x.FirstName,
            LastName                 = x.LastName,
            Decision                 = approvedSet.Contains(x.UserId) ? "assigned" : "standby",
            Rank                     = i + 1,
            TotalScore               = Math.Round(x.Score, 3),
            CommitmentRate           = Math.Round(x.CommitmentRate, 3),
            CommitmentScore          = Math.Round(x.CommitmentScore, 3),
            AttendanceMinutesLateAvg = Math.Round(x.AttendanceMinutesLateAvg, 1),
            AttendanceScore          = Math.Round(x.AttendanceScore, 3),
            RoleExperienceRate       = Math.Round(x.RoleExperienceRate, 3),
            RoleFitScore             = Math.Round(x.RoleFitScore, 3),
            CostPerHour              = Math.Round(x.CostPerHour, 2),
            CostScore                = Math.Round(x.CostScore, 3),
            Explanation              = BuildAutoAssignExplanation(
                approvedSet.Contains(x.UserId),
                x.Score,
                x.CommitmentRate,
                x.AttendanceMinutesLateAvg,
                x.RoleExperienceRate,
                x.CostPerHour)
        }).ToList();

        await using (var conn = new SqlConnection(_connectionString))
        await using (var cmd = new SqlCommand("sp_ApplyAutoAssignDecisions", conn)
            { CommandType = CommandType.StoredProcedure })
        {
            cmd.Parameters.AddWithValue("@shiftId",    shiftId);
            cmd.Parameters.AddWithValue("@approveCsv", string.Join(",", toApprove));
            cmd.Parameters.AddWithValue("@standbyCsv", string.Join(",", toStandby));
            await conn.OpenAsync();
            await cmd.ExecuteNonQueryAsync();
        }

        // Step 7: Build and return the result summary
        var result = new AutoAssignResult
        {
            ShiftId         = shiftId,
            RoleName        = roleName,
            ShiftStart      = shiftStart,
            ShiftEnd        = shiftEnd,
            Required        = requiredQty,
            AlreadyApproved = alreadyApproved,
            Assigned        = toApprove.Count,
            Standby         = toStandby.Count,
            Decisions       = decisions,
        };

        if (toApprove.Count < remainingSlots)
            result.Warning = $"Only {toApprove.Count} out of {remainingSlots} open slots could be filled. " +
                             $"Not enough applicants without scheduling conflicts.";

        return result;
    }

    private static string BuildAutoAssignExplanation(
        bool assigned,
        double totalScore,
        double commitmentRate,
        double attendanceMinutesLateAvg,
        double roleExperienceRate,
        double costPerHour)
    {
        var reasons = new List<string>();

        if (roleExperienceRate >= 0.7)
            reasons.Add("strong experience in this role");
        else if (roleExperienceRate >= 0.35)
            reasons.Add("some experience in this role");
        else
            reasons.Add("limited history in this role");

        if (attendanceMinutesLateAvg <= 5)
            reasons.Add("very reliable arrival history");
        else if (attendanceMinutesLateAvg <= 15)
            reasons.Add("reasonable arrival history");
        else
            reasons.Add("higher average lateness");

        if (commitmentRate >= 0.85)
            reasons.Add("high acceptance/commitment rate");
        else if (commitmentRate >= 0.55)
            reasons.Add("moderate acceptance/commitment rate");
        else
            reasons.Add("lower acceptance/commitment rate");

        if (costPerHour > 0)
            reasons.Add($"cost is {costPerHour:0.##}/hr");

        var prefix = assigned ? "Selected because of" : "Moved to standby after comparing";
        return $"{prefix} {string.Join(", ", reasons)}. Overall score: {totalScore:P0}.";
    }

    // ══════════════════════════════════════════════════════════════════════
    //  EVENT-FIRST (standalone events — no project concept in UI)
    // ══════════════════════════════════════════════════════════════════════

    // ── List all events visible to this manager ────────────────────────────
    public async Task<IEnumerable<EventListItemResponse>> GetEventsByManagerAsync(string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_GetEventsByManager", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@firebaseUid", firebaseUid);

        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();

        var results = new List<EventListItemResponse>();
        while (await reader.ReadAsync())
        {
            results.Add(new EventListItemResponse
            {
                EventId         = reader.GetString(reader.GetOrdinal("EventId")),
                Name            = reader.GetString(reader.GetOrdinal("Name")),
                StartTime       = reader.IsDBNull(reader.GetOrdinal("StartTime"))       ? null : reader.GetDateTime(reader.GetOrdinal("StartTime")),
                EndTime         = reader.IsDBNull(reader.GetOrdinal("EndTime"))         ? null : reader.GetDateTime(reader.GetOrdinal("EndTime")),
                Status          = reader.GetString(reader.GetOrdinal("Status")),
                EventType       = reader.IsDBNull(reader.GetOrdinal("EventType"))       ? null : reader.GetString(reader.GetOrdinal("EventType")),
                Location        = reader.IsDBNull(reader.GetOrdinal("Location"))        ? null : reader.GetString(reader.GetOrdinal("Location")),
                PlannedBudget   = reader.IsDBNull(reader.GetOrdinal("PlannedBudget"))   ? null : reader.GetDecimal(reader.GetOrdinal("PlannedBudget")),
                ExpectedRevenue = reader.IsDBNull(reader.GetOrdinal("ExpectedRevenue")) ? null : reader.GetDecimal(reader.GetOrdinal("ExpectedRevenue")),
                AttendeesCount  = reader.IsDBNull(reader.GetOrdinal("AttendeesCount"))  ? null : reader.GetInt32(reader.GetOrdinal("AttendeesCount")),
                CustomerId      = reader.IsDBNull(reader.GetOrdinal("CustomerId"))      ? null : reader.GetString(reader.GetOrdinal("CustomerId")),
                CustomerName    = reader.IsDBNull(reader.GetOrdinal("CustomerName"))    ? null : reader.GetString(reader.GetOrdinal("CustomerName")),
                RequiredCount   = reader.GetInt32(reader.GetOrdinal("RequiredCount")),
                StaffedCount    = reader.GetInt32(reader.GetOrdinal("StaffedCount")),
            });
        }
        return results;
    }

    // ── Get Gantt schedule for a single event ──────────────────────────────
    public async Task<ScheduleEventItem?> GetEventScheduleByIdAsync(string eventId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        ScheduleEventItem? item = null;

        await using (var cmd = new SqlCommand("sp_GetEventScheduleById", conn)
            { CommandType = CommandType.StoredProcedure })
        {
            cmd.Parameters.AddWithValue("@eventId", eventId);
            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                if (item == null)
                {
                    item = new ScheduleEventItem
                    {
                        EventId   = reader.GetString(reader.GetOrdinal("EventId")),
                        EventName = reader.GetString(reader.GetOrdinal("EventName")),
                        StartTime = reader.IsDBNull(reader.GetOrdinal("EventStart"))    ? null : reader.GetDateTime(reader.GetOrdinal("EventStart")),
                        EndTime   = reader.IsDBNull(reader.GetOrdinal("EventEnd"))      ? null : reader.GetDateTime(reader.GetOrdinal("EventEnd")),
                        Location  = reader.IsDBNull(reader.GetOrdinal("EventLocation")) ? null : reader.GetString(reader.GetOrdinal("EventLocation")),
                    };
                }
                if (!reader.IsDBNull(reader.GetOrdinal("ShiftId")))
                {
                    item.Shifts.Add(new ScheduleShiftItem
                    {
                        ShiftId          = reader.GetString(reader.GetOrdinal("ShiftId")),
                        RoleId           = reader.IsDBNull(reader.GetOrdinal("RoleId"))   ? "" : reader.GetString(reader.GetOrdinal("RoleId")),
                        RoleName         = reader.IsDBNull(reader.GetOrdinal("RoleName")) ? "" : reader.GetString(reader.GetOrdinal("RoleName")),
                        RequiredQuantity = reader.GetInt32(reader.GetOrdinal("RequiredQuantity")),
                        StaffedCount     = reader.GetInt32(reader.GetOrdinal("StaffedCount")),
                        StartTime        = reader.IsDBNull(reader.GetOrdinal("ShiftStart")) ? null : reader.GetDateTime(reader.GetOrdinal("ShiftStart")),
                        EndTime          = reader.IsDBNull(reader.GetOrdinal("ShiftEnd"))   ? null : reader.GetDateTime(reader.GetOrdinal("ShiftEnd")),
                    });
                }
            }
        }
        return item;
    }

    // ── Create a standalone event (auto-creates a hidden wrapper project) ──
    public async Task<string> CreateStandaloneEventAsync(
        string companyId, string managerId, CreateEventStandaloneRequest request)
    {
        var projId  = Guid.NewGuid().ToString();
        var eventId = Guid.NewGuid().ToString();

        var validStatuses = new HashSet<string> { "planning", "active", "completed", "canceled" };
        var status = validStatuses.Contains(request.Status) ? request.Status : "planning";

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_CreateStandaloneEvent", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@projId",          projId);
        cmd.Parameters.AddWithValue("@eventId",         eventId);
        cmd.Parameters.AddWithValue("@companyId",       companyId);
        cmd.Parameters.AddWithValue("@managerId",       managerId);
        cmd.Parameters.AddWithValue("@name",            request.Name.Trim());
        cmd.Parameters.AddWithValue("@location",        (object?)request.Location?.Trim() ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@startTime",       request.StartTime);
        cmd.Parameters.AddWithValue("@endTime",         request.EndTime);
        cmd.Parameters.AddWithValue("@status",          status);
        cmd.Parameters.AddWithValue("@attendeesCount",  (object?)request.AttendeesCount   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@eventType",       request.EventType?.Trim() ?? "other");
        cmd.Parameters.AddWithValue("@plannedBudget",   (object?)request.PlannedBudget    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@expectedRevenue", (object?)request.ExpectedRevenue  ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@customerId",      (object?)request.CustomerId       ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@shiftsJson",      System.Text.Json.JsonSerializer.Serialize(request.Shifts));

        await conn.OpenAsync();
        try
        {
            await cmd.ExecuteNonQueryAsync();
        }
        catch (SqlException ex) when (ex.Message.Contains("Customer not found"))
        {
            throw new ArgumentException("Customer not found or does not belong to your company.", ex);
        }

        return eventId;
    }

    // ── Potential workers for an event (no projId needed) ─────────────────
    public async Task<IEnumerable<PotentialWorkerResponse>?> GetPotentialWorkersByEventAsync(
        string eventId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null)
            return null;

        await using var cmd = new SqlCommand("sp_GetPotentialWorkersByEvent", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@eventId",     eventId);
        cmd.Parameters.AddWithValue("@firebaseUid", firebaseUid);

        var workers = new Dictionary<string, PotentialWorkerResponse>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var userId = reader.GetString(reader.GetOrdinal("user_ID"));
            if (!workers.TryGetValue(userId, out var worker))
            {
                worker = new PotentialWorkerResponse
                {
                    UserId      = userId,
                    FbUid       = reader.IsDBNull(reader.GetOrdinal("FBUID")) ? "" : reader.GetString(reader.GetOrdinal("FBUID")),
                    FirstName   = reader.GetString(reader.GetOrdinal("firstName")),
                    LastName    = reader.GetString(reader.GetOrdinal("lastName")),
                    CostPerHour = reader.IsDBNull(reader.GetOrdinal("cost_per_hour")) ? null : reader.GetDecimal(reader.GetOrdinal("cost_per_hour")),
                    EligibleShifts = [],
                };
                workers[userId] = worker;
            }

            worker.EligibleShifts.Add(new EligibleShiftItem
            {
                ShiftId           = reader.GetString(reader.GetOrdinal("Shift_ID")),
                RoleId            = reader.GetString(reader.GetOrdinal("roll_ID")),
                RoleName          = reader.GetString(reader.GetOrdinal("Roll_name")),
                StartTime         = reader.IsDBNull(reader.GetOrdinal("start_time")) ? null : reader.GetDateTime(reader.GetOrdinal("start_time")),
                EndTime           = reader.IsDBNull(reader.GetOrdinal("end_time"))   ? null : reader.GetDateTime(reader.GetOrdinal("end_time")),
                RequiredQuantity  = reader.GetInt32(reader.GetOrdinal("required_quantity")),
                ActiveAssignments = reader.GetInt32(reader.GetOrdinal("ActiveAssignments")),
            });
        }

        return workers.Values.ToList();
    }

    // ── Shift Cancellation Notices ────────────────────────────────────────
    public async Task<IEnumerable<ShiftCancellationNotice>> GetCancellationNoticesForEmployeeAsync(string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_GetCancellationNoticesForEmployee", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@fbUid", firebaseUid);
        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();

        var list = new List<ShiftCancellationNotice>();
        while (await reader.ReadAsync())
            list.Add(new ShiftCancellationNotice
            {
                NoticeId   = reader.GetString(reader.GetOrdinal("NoticeId")),
                EventName  = reader.IsDBNull(reader.GetOrdinal("EventName"))   ? null : reader.GetString(reader.GetOrdinal("EventName")),
                RoleName   = reader.IsDBNull(reader.GetOrdinal("RoleName"))    ? null : reader.GetString(reader.GetOrdinal("RoleName")),
                ShiftStart = reader.IsDBNull(reader.GetOrdinal("ShiftStart"))  ? null : reader.GetDateTime(reader.GetOrdinal("ShiftStart")),
                ShiftEnd   = reader.IsDBNull(reader.GetOrdinal("ShiftEnd"))    ? null : reader.GetDateTime(reader.GetOrdinal("ShiftEnd")),
                EventStart = reader.IsDBNull(reader.GetOrdinal("EventStart"))  ? null : reader.GetDateTime(reader.GetOrdinal("EventStart")),
                CancelledAt = reader.GetDateTime(reader.GetOrdinal("CancelledAt")),
            });
        return list;
    }

    // ── Send offer to employee for an event (no projId needed) ───────────
    public async Task SendOfferByEventAsync(
        string eventId, string employeeFbUid, List<string> shiftIds, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new SqlCommand("sp_SendOfferByEvent", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@eventId",       eventId);
        cmd.Parameters.AddWithValue("@employeeFbUid", employeeFbUid);
        cmd.Parameters.AddWithValue("@managerFbUid",  firebaseUid);
        cmd.Parameters.AddWithValue("@shiftIdsCsv",   string.Join(",", shiftIds));

        try
        {
            await cmd.ExecuteNonQueryAsync();
        }
        catch (SqlException ex) when (ex.Message.Contains("Event not found."))
        {
            throw new KeyNotFoundException("Event not found.", ex);
        }
        catch (SqlException ex) when (ex.Message.Contains("Employee not found"))
        {
            throw new UnauthorizedAccessException("Employee not found or not in your company.", ex);
        }
        catch (SqlException ex) when (ex.Message.Contains("shift IDs"))
        {
            throw new ArgumentException("One or more shift IDs do not belong to this event.", ex);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    //  SHIFT BRIEFS & EQUIPMENT
    // ══════════════════════════════════════════════════════════════════════

    // ── Helper: verify manager has access to a shift (returns eventId or null) ──
    private async Task<string?> CheckShiftAccessAsync(SqlConnection conn, string shiftId, string firebaseUid)
    {
        await using var cmd = new SqlCommand("sp_CheckShiftAccess", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@shiftId", shiftId);
        cmd.Parameters.AddWithValue("@fbUid",   firebaseUid);
        return (await cmd.ExecuteScalarAsync()) as string;
    }

    // ── Helper: read ShiftEquipmentItem from open SqlDataReader ───────────
    private static ShiftEquipmentItem ReadShiftEquipmentItem(SqlDataReader r) => new()
    {
        EquipmentId          = r.GetString(r.GetOrdinal("equipment_ID")),
        ShiftId              = r.GetString(r.GetOrdinal("shift_ID")),
        Name                 = r.IsDBNull(r.GetOrdinal("name"))             ? "" : r.GetString(r.GetOrdinal("name")),
        Quantity             = r.IsDBNull(r.GetOrdinal("quantity"))         ? 1  : r.GetInt32(r.GetOrdinal("quantity")),
        Notes                = r.IsDBNull(r.GetOrdinal("notes"))            ? null : r.GetString(r.GetOrdinal("notes")),
        CreatedAt            = r.IsDBNull(r.GetOrdinal("created_at"))       ? null : r.GetDateTime(r.GetOrdinal("created_at")),
        CreatedByManagerName = r.IsDBNull(r.GetOrdinal("created_by_manager_name")) ? null : r.GetString(r.GetOrdinal("created_by_manager_name")),
    };

    public async Task<IEnumerable<ShiftSummaryItem>?> GetShiftsForEventAsync(string eventId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_GetEventShifts", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@eventId", eventId);
        await using var reader = await cmd.ExecuteReaderAsync();

        var list = new List<ShiftSummaryItem>();
        while (await reader.ReadAsync())
            list.Add(new ShiftSummaryItem
            {
                ShiftId   = reader.GetString(reader.GetOrdinal("ShiftId")),
                RoleName  = reader.IsDBNull(reader.GetOrdinal("RoleName")) ? "" : reader.GetString(reader.GetOrdinal("RoleName")),
                StartTime = reader.IsDBNull(reader.GetOrdinal("StartTime")) ? null : reader.GetDateTime(reader.GetOrdinal("StartTime")),
                EndTime   = reader.IsDBNull(reader.GetOrdinal("EndTime"))   ? null : reader.GetDateTime(reader.GetOrdinal("EndTime")),
            });
        return list;
    }

    public async Task<IEnumerable<BriefItem>?> GetBriefsByShiftIdAsync(string shiftId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckShiftAccessAsync(conn, shiftId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_GetShiftBriefs", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@shiftId", shiftId);
        await using var reader = await cmd.ExecuteReaderAsync();

        var list = new List<BriefItem>();
        while (await reader.ReadAsync()) list.Add(ReadBriefItem(reader));
        return list;
    }

    public async Task<BriefItem?> CreateShiftBriefAsync(string shiftId, CreateBriefRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckShiftAccessAsync(conn, shiftId, firebaseUid) == null) return null;

        var newId = Guid.NewGuid().ToString();
        await using var cmd = new SqlCommand("sp_CreateShiftBrief", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@briefId",     newId);
        cmd.Parameters.AddWithValue("@title",       request.Title);
        cmd.Parameters.AddWithValue("@content",     request.Content);
        cmd.Parameters.AddWithValue("@createdAt",   DateTime.UtcNow);
        cmd.Parameters.AddWithValue("@firebaseUid", firebaseUid);
        cmd.Parameters.AddWithValue("@shiftId",     shiftId);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return ReadBriefItem(reader);
    }

    public async Task<BriefItem?> UpdateShiftBriefAsync(string briefId, string shiftId, UpdateBriefRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckShiftAccessAsync(conn, shiftId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_UpdateShiftBrief", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@briefId",  briefId);
        cmd.Parameters.AddWithValue("@title",    request.Title);
        cmd.Parameters.AddWithValue("@content",  request.Content);
        cmd.Parameters.AddWithValue("@shiftId",  shiftId);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;
        return ReadBriefItem(reader);
    }

    public async Task<bool?> DeleteShiftBriefAsync(string briefId, string shiftId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckShiftAccessAsync(conn, shiftId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_DeleteShiftBrief", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@briefId", briefId);
        cmd.Parameters.AddWithValue("@shiftId", shiftId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
    }

    public async Task<IEnumerable<ShiftEquipmentItem>?> GetShiftEquipmentAsync(string shiftId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckShiftAccessAsync(conn, shiftId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_GetShiftEquipment", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@shiftId", shiftId);
        await using var reader = await cmd.ExecuteReaderAsync();

        var list = new List<ShiftEquipmentItem>();
        while (await reader.ReadAsync()) list.Add(ReadShiftEquipmentItem(reader));
        return list;
    }

    public async Task<ShiftEquipmentItem?> CreateShiftEquipmentAsync(string shiftId, CreateEquipmentRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckShiftAccessAsync(conn, shiftId, firebaseUid) == null) return null;

        var newId = Guid.NewGuid().ToString();
        await using var cmd = new SqlCommand("sp_CreateShiftEquipment", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@equipmentId", newId);
        cmd.Parameters.AddWithValue("@shiftId",     shiftId);
        cmd.Parameters.AddWithValue("@name",         request.Name.Trim());
        cmd.Parameters.AddWithValue("@quantity",     request.Quantity > 0 ? request.Quantity : 1);
        cmd.Parameters.AddWithValue("@notes",        (object?)request.Notes ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@firebaseUid",  firebaseUid);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return ReadShiftEquipmentItem(reader);
    }

    public async Task<ShiftEquipmentItem?> UpdateShiftEquipmentAsync(string equipmentId, string shiftId, UpdateEquipmentRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckShiftAccessAsync(conn, shiftId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_UpdateShiftEquipment", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@equipmentId", equipmentId);
        cmd.Parameters.AddWithValue("@shiftId",     shiftId);
        cmd.Parameters.AddWithValue("@name",        request.Name.Trim());
        cmd.Parameters.AddWithValue("@quantity",    request.Quantity > 0 ? request.Quantity : 1);
        cmd.Parameters.AddWithValue("@notes",       (object?)request.Notes ?? DBNull.Value);
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;
        return ReadShiftEquipmentItem(reader);
    }

    public async Task<bool?> DeleteShiftEquipmentAsync(string equipmentId, string shiftId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckShiftAccessAsync(conn, shiftId, firebaseUid) == null) return null;

        await using var cmd = new SqlCommand("sp_DeleteShiftEquipment", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@equipmentId", equipmentId);
        cmd.Parameters.AddWithValue("@shiftId",     shiftId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
    }

    public async Task<IEnumerable<ShiftEquipmentItem>?> GetEquipmentForEmployeeAsync(string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_GetEquipmentForEmployee", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@fbUid", firebaseUid);
        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();

        var list = new List<ShiftEquipmentItem>();
        while (await reader.ReadAsync())
            list.Add(new ShiftEquipmentItem
            {
                EquipmentId = reader.GetString(reader.GetOrdinal("equipment_ID")),
                ShiftId     = reader.GetString(reader.GetOrdinal("shift_ID")),
                Name        = reader.IsDBNull(reader.GetOrdinal("name"))       ? "" : reader.GetString(reader.GetOrdinal("name")),
                Quantity    = reader.IsDBNull(reader.GetOrdinal("quantity"))   ? 1  : reader.GetInt32(reader.GetOrdinal("quantity")),
                Notes       = reader.IsDBNull(reader.GetOrdinal("notes"))      ? null : reader.GetString(reader.GetOrdinal("notes")),
                CreatedAt   = reader.IsDBNull(reader.GetOrdinal("created_at")) ? null : reader.GetDateTime(reader.GetOrdinal("created_at")),
                EventId     = reader.IsDBNull(reader.GetOrdinal("event_ID"))   ? null : reader.GetString(reader.GetOrdinal("event_ID")),
                ProjectId   = reader.IsDBNull(reader.GetOrdinal("project_ID")) ? null : reader.GetString(reader.GetOrdinal("project_ID")),
            });
        return list;
    }

}
