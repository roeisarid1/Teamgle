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
        const string sql = """
            SELECT u.company_ID
            FROM [User] u
            INNER JOIN Manager m ON u.user_ID = m.user_ID
            WHERE u.FBUID = @fbuid
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@fbuid", firebaseUid);

        await conn.OpenAsync();
        var result = await cmd.ExecuteScalarAsync();
        return result as string;
    }

    // ── Get the user_ID for a manager by their Firebase UID ───────────────
    public async Task<string?> GetManagerUserIdAsync(string firebaseUid)
    {
        const string sql = """
            SELECT u.user_ID
            FROM [User] u
            INNER JOIN Manager m ON u.user_ID = m.user_ID
            WHERE u.FBUID = @fbuid
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);
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

        const string sql = """
            INSERT INTO Project
                (Proj_ID, name, start_date, end_date, status, customer_ID)
            VALUES
                (@projId, @name, @startDate, @endDate, @status, @customerId)
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);

        cmd.Parameters.AddWithValue("@projId",     projId);
        cmd.Parameters.AddWithValue("@name",       request.Name.Trim());
        cmd.Parameters.AddWithValue("@startDate",  (object?)request.StartDate ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@endDate",    (object?)request.EndDate   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@status",     status);
        cmd.Parameters.AddWithValue("@customerId", (object?)request.CustomerId ?? DBNull.Value);

        await conn.OpenAsync();
        await cmd.ExecuteNonQueryAsync();

        return projId;
    }

    // ── Insert into Manager_Project (links manager as owner) ──────────────
    public async Task CreateManagerProjectAsync(string projId, string userId)
    {
        const string sql = """
            INSERT INTO Manager_Project
                (manager_user_ID, project_ID, is_owner, joined_at)
            VALUES
                (@managerUserId, @projectId, 1, GETDATE())
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);

        cmd.Parameters.AddWithValue("@managerUserId", userId);
        cmd.Parameters.AddWithValue("@projectId",     projId);

        await conn.OpenAsync();
        await cmd.ExecuteNonQueryAsync();
    }

    // ── Insert into Event, return new event_ID ────────────────────────────
    public async Task<string> CreateEventAsync(string projId, CreateEventRequest request)
    {
        var eventId = Guid.NewGuid().ToString();

        const string sql = """
            INSERT INTO Event
                (event_ID, name, location, start_time, end_time,
                 project_ID, status, attendees_count, event_type,
                 planned_budget, expected_revenue)
            VALUES
                (@eventId, @name, @location, @startTime, @endTime,
                 @projectId, 'planning', @attendeesCount, @eventType,
                 @plannedBudget, @expectedRevenue)
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);

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
        const string sql = """
            SELECT
                p.Proj_ID                                     AS ProjId,
                p.name                                        AS Name,
                p.start_date                                  AS StartDate,
                p.end_date                                    AS EndDate,
                p.status                                      AS Status,
                c.customer_company_name                       AS CustomerName,
                COUNT(DISTINCT e.event_ID)                    AS EventCount,
                ISNULL(SUM(s.required_quantity), 0)           AS RequiredCount,
                COUNT(DISTINCT CASE
                    WHEN es.status IN ('approved', 'manager_approved')
                     AND (es.canceled IS NULL OR es.canceled = 0)
                    THEN es.employee_user_ID
                END)                                          AS StaffedCount
            FROM Manager_Project mp
            INNER JOIN [User] u  ON mp.manager_user_ID = u.user_ID
            INNER JOIN Project p ON mp.project_ID       = p.Proj_ID
            LEFT  JOIN Customer c        ON p.customer_ID  = c.customer_ID
            LEFT  JOIN Event e           ON e.project_ID   = p.Proj_ID
            LEFT  JOIN Shift s           ON s.event_ID     = e.event_ID
            LEFT  JOIN Employee_Shift es ON es.shift_ID    = s.Shift_ID
            WHERE u.FBUID = @firebaseUid
            GROUP BY
                p.Proj_ID, p.name, p.start_date, p.end_date,
                p.status, c.customer_company_name
            ORDER BY p.start_date DESC
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);
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
        // Query 1: project info + access check
        const string projSql = """
            SELECT
                p.Proj_ID                 AS ProjId,
                p.name                    AS Name,
                p.start_date              AS StartDate,
                p.end_date                AS EndDate,
                p.status                  AS Status,
                c.customer_company_name   AS CustomerName
            FROM Project p
            INNER JOIN Manager_Project mp ON mp.project_ID      = p.Proj_ID
            INNER JOIN [User]          u  ON u.user_ID           = mp.manager_user_ID
            LEFT  JOIN Customer        c  ON c.customer_ID       = p.customer_ID
            WHERE p.Proj_ID = @projId
              AND u.FBUID   = @firebaseUid
            """;

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        ProjectDetailResponse? detail = null;

        await using (var cmd = new SqlCommand(projSql, conn))
        {
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
                    CustomerName = reader.IsDBNull(reader.GetOrdinal("CustomerName")) ? null : reader.GetString(reader.GetOrdinal("CustomerName")),
                };
            }
        }

        if (detail == null) return null;

        // Query 2: events for this project
        const string eventSql = """
            SELECT
                e.event_ID    AS EventId,
                e.name        AS Name,
                e.location    AS Location,
                e.start_time  AS StartTime,
                e.end_time    AS EndTime,
                e.status      AS Status,
                e.event_type  AS EventType
            FROM Event e
            WHERE e.project_ID = @projId
            ORDER BY e.start_time
            """;

        await using (var cmd = new SqlCommand(eventSql, conn))
        {
            cmd.Parameters.AddWithValue("@projId", projId);

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                detail.Events.Add(new EventDetailItem
                {
                    EventId   = reader.GetString(reader.GetOrdinal("EventId")),
                    Name      = reader.GetString(reader.GetOrdinal("Name")),
                    Location  = reader.IsDBNull(reader.GetOrdinal("Location"))  ? null : reader.GetString(reader.GetOrdinal("Location")),
                    StartTime = reader.IsDBNull(reader.GetOrdinal("StartTime")) ? null : reader.GetDateTime(reader.GetOrdinal("StartTime")),
                    EndTime   = reader.IsDBNull(reader.GetOrdinal("EndTime"))   ? null : reader.GetDateTime(reader.GetOrdinal("EndTime")),
                    Status    = reader.GetString(reader.GetOrdinal("Status")),
                    EventType = reader.IsDBNull(reader.GetOrdinal("EventType")) ? null : reader.GetString(reader.GetOrdinal("EventType")),
                });
            }
        }

        detail.EventCount = detail.Events.Count;
        return detail;
    }

    // ── Get schedule (events + shifts with staffing) for a project ────────
    public async Task<ProjectScheduleResponse?> GetProjectScheduleAsync(string projId, string firebaseUid)
    {
        // Query 1: project name + access check (same guard as GetProjectDetailAsync)
        const string projSql = """
            SELECT p.Proj_ID AS ProjId, p.name AS Name
            FROM Project p
            INNER JOIN Manager_Project mp ON mp.project_ID    = p.Proj_ID
            INNER JOIN [User]          u  ON u.user_ID         = mp.manager_user_ID
            WHERE p.Proj_ID = @projId
              AND u.FBUID   = @firebaseUid
            """;

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        ProjectScheduleResponse? schedule = null;

        await using (var cmd = new SqlCommand(projSql, conn))
        {
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

        // Query 2: all events with their shifts, role names, and per-shift staffed counts
        const string scheduleSql = """
            SELECT
                e.event_ID                    AS EventId,
                e.name                        AS EventName,
                e.start_time                  AS EventStart,
                e.end_time                    AS EventEnd,
                e.location                    AS EventLocation,
                s.Shift_ID                    AS ShiftId,
                s.roll_ID                     AS RoleId,
                r.Roll_name                   AS RoleName,
                s.required_quantity           AS RequiredQuantity,
                s.start_time                  AS ShiftStart,
                s.end_time                    AS ShiftEnd,
                COUNT(DISTINCT CASE
                    WHEN es.status IN ('approved', 'manager_approved')
                     AND (es.canceled IS NULL OR es.canceled = 0)
                    THEN es.employee_user_ID
                END)                          AS StaffedCount
            FROM Event e
            LEFT JOIN Shift           s  ON s.event_ID  = e.event_ID
            LEFT JOIN Roll            r  ON r.Roll_ID   = s.roll_ID
            LEFT JOIN Employee_Shift  es ON es.shift_ID = s.Shift_ID
            WHERE e.project_ID = @projId
            GROUP BY
                e.event_ID, e.name, e.start_time, e.end_time, e.location,
                s.Shift_ID, s.roll_ID, r.Roll_name, s.required_quantity, s.start_time, s.end_time
            ORDER BY e.start_time, s.start_time
            """;

        await using (var cmd = new SqlCommand(scheduleSql, conn))
        {
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

        // UPDATE only if the shift belongs to a project the authenticated manager owns
        const string sql = """
            UPDATE Shift
            SET roll_ID           = @rollId,
                required_quantity = @requiredQuantity,
                start_time        = @startTime,
                end_time          = @endTime
            WHERE Shift_ID = @shiftId
              AND Shift_ID IN (
                SELECT s.Shift_ID
                FROM Shift s
                INNER JOIN Event          e  ON e.event_ID     = s.event_ID
                INNER JOIN Project        p  ON p.Proj_ID       = e.project_ID
                INNER JOIN Manager_Project mp ON mp.project_ID  = p.Proj_ID
                INNER JOIN [User]         u  ON u.user_ID       = mp.manager_user_ID
                WHERE s.Shift_ID = @shiftId
                  AND u.FBUID    = @firebaseUid
              )
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);

        cmd.Parameters.AddWithValue("@shiftId",          shiftId);
        cmd.Parameters.AddWithValue("@firebaseUid",      firebaseUid);
        cmd.Parameters.AddWithValue("@rollId",           request.RollId);
        cmd.Parameters.AddWithValue("@requiredQuantity", request.RequiredQuantity);
        cmd.Parameters.AddWithValue("@startTime",        request.StartTime);
        cmd.Parameters.AddWithValue("@endTime",          request.EndTime);

        await conn.OpenAsync();
        var rows = await cmd.ExecuteNonQueryAsync();

        if (rows == 0)
            throw new KeyNotFoundException("Shift not found.");
    }

    // ── Delete a shift (ownership-validated) ──────────────────────────────
    public async Task DeleteShiftAsync(string shiftId, string firebaseUid)
    {
        // DELETE only if the shift belongs to a project the authenticated manager owns
        const string sql = """
            DELETE FROM Shift
            WHERE Shift_ID = @shiftId
              AND Shift_ID IN (
                SELECT s.Shift_ID
                FROM Shift s
                INNER JOIN Event          e  ON e.event_ID     = s.event_ID
                INNER JOIN Project        p  ON p.Proj_ID       = e.project_ID
                INNER JOIN Manager_Project mp ON mp.project_ID  = p.Proj_ID
                INNER JOIN [User]         u  ON u.user_ID       = mp.manager_user_ID
                WHERE s.Shift_ID = @shiftId
                  AND u.FBUID    = @firebaseUid
              )
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);

        cmd.Parameters.AddWithValue("@shiftId",     shiftId);
        cmd.Parameters.AddWithValue("@firebaseUid", firebaseUid);

        await conn.OpenAsync();
        var rows = await cmd.ExecuteNonQueryAsync();

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

        // Verify the event belongs to a project the authenticated manager owns
        const string checkSql = """
            SELECT e.event_ID
            FROM Event e
            INNER JOIN Project         p  ON p.Proj_ID      = e.project_ID
            INNER JOIN Manager_Project mp ON mp.project_ID  = p.Proj_ID
            INNER JOIN [User]          u  ON u.user_ID       = mp.manager_user_ID
            WHERE e.event_ID = @eventId
              AND u.FBUID    = @firebaseUid
            """;

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        await using (var checkCmd = new SqlCommand(checkSql, conn))
        {
            checkCmd.Parameters.AddWithValue("@eventId",     eventId);
            checkCmd.Parameters.AddWithValue("@firebaseUid", firebaseUid);
            var found = await checkCmd.ExecuteScalarAsync();
            if (found == null)
                throw new KeyNotFoundException("Event not found.");
        }

        const string insertSql = """
            INSERT INTO Shift
                (Shift_ID, event_ID, roll_ID, required_quantity, start_time, end_time)
            VALUES
                (@shiftId, @eventId, @rollId, @requiredQuantity, @startTime, @endTime)
            """;

        await using var cmd = new SqlCommand(insertSql, conn);
        cmd.Parameters.AddWithValue("@shiftId",          Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("@eventId",          eventId);
        cmd.Parameters.AddWithValue("@rollId",           request.RollId);
        cmd.Parameters.AddWithValue("@requiredQuantity", request.RequiredQuantity);
        cmd.Parameters.AddWithValue("@startTime",        request.StartTime);
        cmd.Parameters.AddWithValue("@endTime",          request.EndTime);

        await cmd.ExecuteNonQueryAsync();
    }

    // ── Insert into Shift ──────────────────────────────────────────────────
    public async Task CreateShiftAsync(string eventId, CreateShiftRequest request)
    {
        const string sql = """
            INSERT INTO Shift
                (Shift_ID, event_ID, roll_ID, required_quantity, start_time, end_time)
            VALUES
                (@shiftId, @eventId, @rollId, @requiredQuantity, @startTime, @endTime)
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);

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
        const string existsSql = "SELECT 1 FROM Project WHERE Proj_ID = @projId";
        await using (var cmd = new SqlCommand(existsSql, conn))
        {
            cmd.Parameters.AddWithValue("@projId", projId);
            if (await cmd.ExecuteScalarAsync() == null) return null;
        }

        const string accessSql = """
            SELECT 1
            FROM   Manager_Project mp
            INNER JOIN [User] u ON u.user_ID = mp.manager_user_ID
            WHERE  mp.project_ID = @projId
              AND  u.FBUID       = @fbUid
            """;
        await using (var cmd = new SqlCommand(accessSql, conn))
        {
            cmd.Parameters.AddWithValue("@projId", projId);
            cmd.Parameters.AddWithValue("@fbUid",  firebaseUid);
            if (await cmd.ExecuteScalarAsync() == null)
                throw new UnauthorizedAccessException("You do not have access to this project.");
        }
        return true;
    }

    // ── GET tasks for a project ────────────────────────────────────────────
    public async Task<IEnumerable<TaskItem>?> GetTasksByProjectIdAsync(string projId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null) return null;

        const string sql = """
            SELECT task_ID, content, status, priority
            FROM   Task
            WHERE  project_ID = @projId
            ORDER  BY task_ID ASC
            """;

        var tasks = new List<TaskItem>();
        await using var cmd    = new SqlCommand(sql, conn);
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
        const string sql = """
            INSERT INTO Task (task_ID, content, status, priority, project_ID, event_ID, shift_ID)
            VALUES (@taskId, @content, @status, @priority, @projId, NULL, NULL)
            """;

        await using var cmd = new SqlCommand(sql, conn);
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

        const string sql = """
            UPDATE Task
            SET    content  = @content,
                   status   = @status,
                   priority = @priority
            WHERE  task_ID    = @taskId
              AND  project_ID = @projId
            """;

        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@content",  request.Content);
        cmd.Parameters.AddWithValue("@status",   request.Status);
        cmd.Parameters.AddWithValue("@priority", request.Priority);
        cmd.Parameters.AddWithValue("@taskId",   taskId);
        cmd.Parameters.AddWithValue("@projId",   projId);
        var rows = await cmd.ExecuteNonQueryAsync();
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

        const string sql = "DELETE FROM Task WHERE task_ID = @taskId AND project_ID = @projId";
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@taskId", taskId);
        cmd.Parameters.AddWithValue("@projId", projId);
        return await cmd.ExecuteNonQueryAsync() > 0;
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

    private const string BriefSelectSql = """
        SELECT b.brief_ID, b.title, b.content, b.created_at,
               b.created_by_manager_user_ID,
               u.firstName + ' ' + u.lastName AS manager_name,
               (SELECT COUNT(*) FROM Brief_Acknowledgment ba
                WHERE ba.brief_ID = b.brief_ID AND ba.is_read = 1) AS ack_count,
               (SELECT COUNT(DISTINCT es.employee_user_ID)
                FROM   Employee_Shift es
                INNER JOIN Shift    s  ON s.Shift_ID  = es.shift_ID
                LEFT  JOIN Event    ev ON ev.event_ID = s.event_ID
                WHERE (b.shift_ID   IS NOT NULL AND es.shift_ID  = b.shift_ID)
                   OR (b.event_ID   IS NOT NULL AND s.event_ID   = b.event_ID)
                   OR (b.project_ID IS NOT NULL AND ev.project_ID = b.project_ID)
               ) AS total_relevant
        FROM   Brief b
        LEFT JOIN [User] u ON u.user_ID = b.created_by_manager_user_ID
        """;

    // ── GET briefs for a project ───────────────────────────────────────────
    public async Task<IEnumerable<BriefItem>?> GetBriefsByProjectIdAsync(string projId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null) return null;

        var sql = BriefSelectSql + " WHERE b.project_ID = @projId ORDER BY b.created_at DESC";
        var briefs = new List<BriefItem>();
        await using var cmd    = new SqlCommand(sql, conn);
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

        string? managerUserId;
        await using (var resolveCmd = new SqlCommand("SELECT user_ID FROM [User] WHERE FBUID = @fbUid", conn))
        {
            resolveCmd.Parameters.AddWithValue("@fbUid", firebaseUid);
            managerUserId = (string?)await resolveCmd.ExecuteScalarAsync();
        }

        var newId = Guid.NewGuid().ToString();
        var now   = DateTime.UtcNow;
        const string insertSql = """
            INSERT INTO Brief (brief_ID, title, content, created_at, created_by_manager_user_ID, project_ID, event_ID, shift_ID)
            VALUES (@briefId, @title, @content, @createdAt, @managerId, @projId, NULL, NULL)
            """;

        await using var cmd = new SqlCommand(insertSql, conn);
        cmd.Parameters.AddWithValue("@briefId",   newId);
        cmd.Parameters.AddWithValue("@title",     request.Title);
        cmd.Parameters.AddWithValue("@content",   request.Content);
        cmd.Parameters.AddWithValue("@createdAt", now);
        cmd.Parameters.AddWithValue("@managerId", (object?)managerUserId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@projId",    projId);
        await cmd.ExecuteNonQueryAsync();

        var selectSql = BriefSelectSql + " WHERE b.brief_ID = @briefId";
        await using var selCmd = new SqlCommand(selectSql, conn);
        selCmd.Parameters.AddWithValue("@briefId", newId);
        await using var reader = await selCmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return ReadBriefItem(reader);
    }

    // ── UPDATE brief ───────────────────────────────────────────────────────
    public async Task<BriefItem?> UpdateBriefAsync(string briefId, string projId, UpdateBriefRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null) return null;

        const string updateSql = """
            UPDATE Brief
            SET    title   = @title,
                   content = @content
            WHERE  brief_ID   = @briefId
              AND  project_ID = @projId
            """;

        await using var cmd = new SqlCommand(updateSql, conn);
        cmd.Parameters.AddWithValue("@title",   request.Title);
        cmd.Parameters.AddWithValue("@content", request.Content);
        cmd.Parameters.AddWithValue("@briefId", briefId);
        cmd.Parameters.AddWithValue("@projId",  projId);
        var rows = await cmd.ExecuteNonQueryAsync();
        if (rows == 0) return null;

        var selectSql = BriefSelectSql + " WHERE b.brief_ID = @briefId";
        await using var selCmd = new SqlCommand(selectSql, conn);
        selCmd.Parameters.AddWithValue("@briefId", briefId);
        await using var reader = await selCmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return ReadBriefItem(reader);
    }

    // ── DELETE brief ───────────────────────────────────────────────────────
    public async Task<bool?> DeleteBriefAsync(string briefId, string projId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null) return null;

        const string sql = "DELETE FROM Brief WHERE brief_ID = @briefId AND project_ID = @projId";
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@briefId", briefId);
        cmd.Parameters.AddWithValue("@projId",  projId);
        return await cmd.ExecuteNonQueryAsync() > 0;
    }

    // ── Employee Job Offers ────────────────────────────────────────────────
    public async Task<IEnumerable<JobOfferResponse>> GetJobOffersForEmployeeAsync(string firebaseUid)
    {
        const string sql = """
            SELECT
                es.shift_ID,
                es.pay_rate_per_hour,
                es.notes,
                es.planned_start_time,
                es.planned_end_time,
                s.start_time        AS shift_start_time,
                s.end_time          AS shift_end_time,
                r.Roll_name,
                e.event_ID,
                e.name              AS event_name,
                e.location          AS event_location,
                e.event_type,
                e.attendees_count,
                p.name              AS project_name,
                u.firstName + ' ' + u.lastName AS manager_name
            FROM Employee_Shift es
            INNER JOIN [User] eu          ON es.employee_user_ID = eu.user_ID
            INNER JOIN Shift s            ON es.shift_ID = s.Shift_ID
            INNER JOIN Roll r             ON s.roll_ID = r.Roll_ID
            INNER JOIN Event e            ON s.event_ID = e.event_ID
            INNER JOIN Project p          ON e.project_ID = p.Proj_ID
            INNER JOIN Manager_Project mp ON p.Proj_ID = mp.project_ID AND mp.is_owner = 1
            INNER JOIN [User] u           ON mp.manager_user_ID = u.user_ID
            WHERE eu.FBUID = @fbuid
              AND es.status = 'manager_offer_sent'
            ORDER BY COALESCE(es.planned_start_time, s.start_time)
            """;

        var offers = new List<JobOfferResponse>();

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@fbuid", firebaseUid);

        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            offers.Add(new JobOfferResponse
            {
                ShiftId          = reader["shift_ID"].ToString()!,
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

        const string sql = """
            UPDATE Employee_Shift
            SET    status           = @newStatus,
                   status_updated_at = GETUTCDATE()
            WHERE  shift_ID         = @shiftId
              AND  employee_user_ID = (SELECT user_ID FROM [User] WHERE FBUID = @fbuid)
              AND  status           = 'manager_offer_sent'
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@newStatus", newStatus);
        cmd.Parameters.AddWithValue("@shiftId",   shiftId);
        cmd.Parameters.AddWithValue("@fbuid",      firebaseUid);

        await conn.OpenAsync();
        return await cmd.ExecuteNonQueryAsync();
    }

    // ── Potential Workers ──────────────────────────────────────────────────
    public async Task<IEnumerable<PotentialWorkerResponse>?> GetPotentialWorkersAsync(
        string projId, string eventId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        // Access check (returns null if project not found, throws if no access)
        if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null)
            return null;

        // Verify the event belongs to this project
        const string eventCheckSql = "SELECT 1 FROM Event WHERE event_ID = @eventId AND project_ID = @projId";
        await using (var cmd = new SqlCommand(eventCheckSql, conn))
        {
            cmd.Parameters.AddWithValue("@eventId", eventId);
            cmd.Parameters.AddWithValue("@projId",  projId);
            if (await cmd.ExecuteScalarAsync() == null)
                return null; // event not found under this project
        }

        // Get company_ID of the calling manager
        string? companyId;
        const string companySql = "SELECT company_ID FROM [User] WHERE FBUID = @fbuid";
        await using (var cmd = new SqlCommand(companySql, conn))
        {
            cmd.Parameters.AddWithValue("@fbuid", firebaseUid);
            companyId = (await cmd.ExecuteScalarAsync()) as string;
        }
        if (companyId == null) return null;

        // Get eligible employees: in same company, role matches a shift in this event,
        // not actively assigned to any shift in this event, and has registered (FBUID not null)
        const string workerSql = """
            SELECT DISTINCT u.user_ID, u.FBUID, u.firstName, u.lastName, emp.cost_per_hour
            FROM [User] u
            INNER JOIN Employee emp        ON emp.user_ID          = u.user_ID
            INNER JOIN Employee_Roll er    ON er.employee_user_ID  = u.user_ID
            INNER JOIN Shift s             ON s.roll_ID            = er.roll_ID
                                          AND s.event_ID           = @eventId
            WHERE u.company_ID = @companyId
              AND u.FBUID IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM Employee_Shift es
                  INNER JOIN Shift s2 ON s2.Shift_ID = es.shift_ID AND s2.event_ID = @eventId
                  WHERE es.employee_user_ID = u.user_ID
                    AND es.status IN (
                        'manager_offer_sent','employee_request',
                        'manager_hold','manager_approved'
                    )
              )
            """;

        var workers = new List<PotentialWorkerResponse>();
        await using (var cmd = new SqlCommand(workerSql, conn))
        {
            cmd.Parameters.AddWithValue("@eventId",   eventId);
            cmd.Parameters.AddWithValue("@companyId", companyId);

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                workers.Add(new PotentialWorkerResponse
                {
                    UserId      = reader.GetString(reader.GetOrdinal("user_ID")),
                    FbUid       = reader.IsDBNull(reader.GetOrdinal("FBUID")) ? "" : reader.GetString(reader.GetOrdinal("FBUID")),
                    FirstName   = reader.GetString(reader.GetOrdinal("firstName")),
                    LastName    = reader.GetString(reader.GetOrdinal("lastName")),
                    CostPerHour = reader.IsDBNull(reader.GetOrdinal("cost_per_hour")) ? null : reader.GetDecimal(reader.GetOrdinal("cost_per_hour")),
                });
            }
        }

        if (workers.Count == 0) return workers;

        // Get eligible shifts per worker with active assignment counts (global per shift)
        var userIds    = workers.Select(w => w.UserId).ToList();
        var paramNames = userIds.Select((_, i) => $"@u{i}").ToList();

        var shiftSql = $"""
            SELECT
                er.employee_user_ID,
                s.Shift_ID,
                s.roll_ID,
                r.Roll_name,
                s.start_time,
                s.end_time,
                s.required_quantity,
                (SELECT COUNT(*) FROM Employee_Shift es2
                 WHERE es2.shift_ID = s.Shift_ID
                   AND es2.status IN (
                       'manager_offer_sent','employee_request',
                       'manager_hold','manager_approved'
                   )
                ) AS ActiveAssignments
            FROM Shift s
            INNER JOIN Roll r          ON r.Roll_ID          = s.roll_ID
            INNER JOIN Employee_Roll er ON er.roll_ID         = s.roll_ID
            WHERE s.event_ID = @eventId
              AND er.employee_user_ID IN ({string.Join(",", paramNames)})
            ORDER BY s.start_time
            """;

        var shiftMap = new Dictionary<string, List<EligibleShiftItem>>();
        await using (var cmd = new SqlCommand(shiftSql, conn))
        {
            cmd.Parameters.AddWithValue("@eventId", eventId);
            for (int i = 0; i < userIds.Count; i++)
                cmd.Parameters.AddWithValue(paramNames[i], userIds[i]);

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var uid = reader.GetString(reader.GetOrdinal("employee_user_ID"));
                if (!shiftMap.TryGetValue(uid, out var list))
                    shiftMap[uid] = list = [];

                list.Add(new EligibleShiftItem
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
        }

        foreach (var w in workers)
            w.EligibleShifts = shiftMap.TryGetValue(w.UserId, out var shifts) ? shifts : [];

        return workers;
    }

    public async Task SendOfferToEmployeeAsync(
        string projId, string eventId, string employeeFbUid,
        List<string> shiftIds, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        // Access check
        if (await CheckProjectAccessAsync(conn, projId, firebaseUid) == null)
            throw new KeyNotFoundException("Project not found.");

        // Verify event belongs to project
        const string eventCheckSql = "SELECT 1 FROM Event WHERE event_ID = @eventId AND project_ID = @projId";
        await using (var cmd = new SqlCommand(eventCheckSql, conn))
        {
            cmd.Parameters.AddWithValue("@eventId", eventId);
            cmd.Parameters.AddWithValue("@projId",  projId);
            if (await cmd.ExecuteScalarAsync() == null)
                throw new KeyNotFoundException("Event not found.");
        }

        // Resolve employee user_ID and verify same company as manager
        string? employeeUserId;
        const string empSql = """
            SELECT eu.user_ID
            FROM [User] eu
            INNER JOIN Employee e ON e.user_ID = eu.user_ID
            WHERE eu.FBUID = @empFbUid
              AND eu.company_ID = (SELECT company_ID FROM [User] WHERE FBUID = @managerFbUid)
            """;
        await using (var cmd = new SqlCommand(empSql, conn))
        {
            cmd.Parameters.AddWithValue("@empFbUid",     employeeFbUid);
            cmd.Parameters.AddWithValue("@managerFbUid", firebaseUid);
            employeeUserId = (await cmd.ExecuteScalarAsync()) as string;
        }
        if (employeeUserId == null)
            throw new UnauthorizedAccessException("Employee not found or not in your company.");

        // Validate all provided shiftIds belong to this event
        var shiftParamNames = shiftIds.Select((_, i) => $"@s{i}").ToList();
        var validateSql = $"""
            SELECT COUNT(*)
            FROM Shift
            WHERE event_ID = @eventId
              AND Shift_ID IN ({string.Join(",", shiftParamNames)})
            """;
        await using (var cmd = new SqlCommand(validateSql, conn))
        {
            cmd.Parameters.AddWithValue("@eventId", eventId);
            for (int i = 0; i < shiftIds.Count; i++)
                cmd.Parameters.AddWithValue(shiftParamNames[i], shiftIds[i]);
            var validCount = Convert.ToInt32(await cmd.ExecuteScalarAsync());
            if (validCount != shiftIds.Count)
                throw new ArgumentException("One or more shift IDs do not belong to this event.");
        }

        // Insert Employee_Shift rows in a transaction, skipping active duplicates
        await using var tx = conn.BeginTransaction();
        try
        {
            const string insertSql = """
                INSERT INTO Employee_Shift (shift_ID, employee_user_ID, status, status_updated_at, payment_status)
                SELECT @shiftId, @empUserId, 'manager_offer_sent', GETUTCDATE(), 'pending'
                WHERE NOT EXISTS (
                    SELECT 1 FROM Employee_Shift
                    WHERE shift_ID          = @shiftId
                      AND employee_user_ID  = @empUserId
                      AND status IN (
                          'manager_offer_sent','employee_request',
                          'manager_hold','manager_approved'
                      )
                )
                """;

            foreach (var shiftId in shiftIds)
            {
                await using var cmd = new SqlCommand(insertSql, conn, tx);
                cmd.Parameters.AddWithValue("@shiftId",   shiftId);
                cmd.Parameters.AddWithValue("@empUserId", employeeUserId);
                await cmd.ExecuteNonQueryAsync();
            }

            await tx.CommitAsync();
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    // ── Get all assigned workers for an event, grouped by status ─────────
    public async Task<EventWorkersResponse> GetEventWorkersAsync(string eventId, string firebaseUid)
    {
        const string sql = """
            SELECT
                es.shift_ID   AS ShiftId,
                u.user_ID     AS UserId,
                u.FBUID       AS FbUid,
                u.firstName   AS FirstName,
                u.lastName    AS LastName,
                r.Roll_name   AS RoleName,
                es.status     AS Status,
                s.start_time  AS ShiftStart,
                s.end_time    AS ShiftEnd
            FROM Employee_Shift es
            INNER JOIN [User]  u  ON u.user_ID  = es.employee_user_ID
            INNER JOIN Shift   s  ON s.Shift_ID = es.shift_ID
            INNER JOIN Roll    r  ON r.Roll_ID  = s.roll_ID
            INNER JOIN Event   e  ON e.event_ID = s.event_ID
            INNER JOIN Project p  ON p.Proj_ID  = e.project_ID
            INNER JOIN Manager_Project mp ON mp.project_ID = p.Proj_ID
            INNER JOIN [User]  mu ON mu.user_ID = mp.manager_user_ID
            WHERE e.event_ID  = @eventId
              AND mu.FBUID    = @firebaseUid
              AND es.status  IN (
                  'manager_offer_sent',
                  'employee_request',
                  'manager_approved',
                  'manager_hold',
                  'manager_reject',
                  'manager_approved_canceled'
              )
            ORDER BY u.lastName, u.firstName
            """;

        var result = new EventWorkersResponse();

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@eventId",     eventId);
        cmd.Parameters.AddWithValue("@firebaseUid", firebaseUid);

        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();

        var ordShiftId    = reader.GetOrdinal("ShiftId");
        var ordUserId     = reader.GetOrdinal("UserId");
        var ordFbUid      = reader.GetOrdinal("FbUid");
        var ordFirstName  = reader.GetOrdinal("FirstName");
        var ordLastName   = reader.GetOrdinal("LastName");
        var ordRoleName   = reader.GetOrdinal("RoleName");
        var ordStatus     = reader.GetOrdinal("Status");
        var ordShiftStart = reader.GetOrdinal("ShiftStart");
        var ordShiftEnd   = reader.GetOrdinal("ShiftEnd");

        while (await reader.ReadAsync())
        {
            var item = new AssignedWorkerItem
            {
                ShiftId    = reader.IsDBNull(ordShiftId)    ? "" : reader.GetString(ordShiftId),
                UserId     = reader.IsDBNull(ordUserId)     ? "" : reader.GetString(ordUserId),
                FbUid      = reader.IsDBNull(ordFbUid)      ? "" : reader.GetString(ordFbUid),
                FirstName  = reader.IsDBNull(ordFirstName)  ? "" : reader.GetString(ordFirstName),
                LastName   = reader.IsDBNull(ordLastName)   ? "" : reader.GetString(ordLastName),
                RoleName   = reader.IsDBNull(ordRoleName)   ? "" : reader.GetString(ordRoleName),
                Status     = reader.IsDBNull(ordStatus)     ? "" : reader.GetString(ordStatus),
                ShiftStart = reader.IsDBNull(ordShiftStart) ? null : reader.GetDateTime(ordShiftStart),
                ShiftEnd   = reader.IsDBNull(ordShiftEnd)   ? null : reader.GetDateTime(ordShiftEnd),
            };

            switch (item.Status)
            {
                case "manager_offer_sent":         result.Awaiting.Add(item);   break;
                case "employee_request":           result.Applicants.Add(item); break;
                case "manager_approved":           result.Approved.Add(item);   break;
                case "manager_hold":               result.Hold.Add(item);       break;
                case "manager_reject":
                case "manager_approved_canceled":  result.Rejected.Add(item);   break;
            }
        }

        return result;
    }

    // ── Update status for a specific shift of an employee in an event ──────
    public async Task UpdateWorkerStatusAsync(
        string eventId, string employeeFbUid, string shiftId, string newStatus, string managerFbUid)
    {
        const string sql = """
            UPDATE Employee_Shift
            SET    status            = @newStatus,
                   status_updated_at = GETUTCDATE()
            WHERE  shift_ID          = @shiftId
              AND  employee_user_ID  = (SELECT user_ID FROM [User] WHERE FBUID = @employeeFbUid)
              AND  shift_ID IN (
                  SELECT s.Shift_ID
                  FROM   Shift s
                  INNER JOIN Event           e  ON e.event_ID   = s.event_ID
                  INNER JOIN Project         p  ON p.Proj_ID    = e.project_ID
                  INNER JOIN Manager_Project mp ON mp.project_ID = p.Proj_ID
                  INNER JOIN [User]          mu ON mu.user_ID   = mp.manager_user_ID
                  WHERE e.event_ID = @eventId
                    AND mu.FBUID   = @managerFbUid
              )
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@newStatus",      newStatus);
        cmd.Parameters.AddWithValue("@shiftId",        shiftId);
        cmd.Parameters.AddWithValue("@employeeFbUid",  employeeFbUid);
        cmd.Parameters.AddWithValue("@eventId",        eventId);
        cmd.Parameters.AddWithValue("@managerFbUid",   managerFbUid);

        await conn.OpenAsync();
        var rowsAffected = await cmd.ExecuteNonQueryAsync();
        if (rowsAffected == 0)
            throw new KeyNotFoundException("No matching assignment found for this shift.");
    }

    // ── Delete a specific Employee_Shift row (return one shift to pool) ────
    public async Task DeleteWorkerAssignmentAsync(
        string eventId, string employeeFbUid, string shiftId, string managerFbUid)
    {
        const string sql = """
            DELETE FROM Employee_Shift
            WHERE  shift_ID          = @shiftId
              AND  employee_user_ID  = (SELECT user_ID FROM [User] WHERE FBUID = @employeeFbUid)
              AND  shift_ID IN (
                  SELECT s.Shift_ID
                  FROM   Shift s
                  INNER JOIN Event           e  ON e.event_ID   = s.event_ID
                  INNER JOIN Project         p  ON p.Proj_ID    = e.project_ID
                  INNER JOIN Manager_Project mp ON mp.project_ID = p.Proj_ID
                  INNER JOIN [User]          mu ON mu.user_ID   = mp.manager_user_ID
                  WHERE e.event_ID = @eventId
                    AND mu.FBUID   = @managerFbUid
              )
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@shiftId",       shiftId);
        cmd.Parameters.AddWithValue("@employeeFbUid", employeeFbUid);
        cmd.Parameters.AddWithValue("@eventId",       eventId);
        cmd.Parameters.AddWithValue("@managerFbUid",  managerFbUid);

        await conn.OpenAsync();
        await cmd.ExecuteNonQueryAsync(); // idempotent — 0 rows affected is acceptable
    }

    // ── Employee's own applications (all active statuses except hold/offer) ─
    public async Task<IEnumerable<MyApplicationResponse>> GetMyApplicationsAsync(string firebaseUid)
    {
        const string sql = """
            SELECT
                es.shift_ID                AS ShiftId,
                es.status                  AS Status,
                r.Roll_name                AS RoleName,
                e.event_ID                 AS EventId,
                e.name                     AS EventName,
                e.location                 AS EventLocation,
                e.start_time               AS EventStart,
                e.end_time                 AS EventEnd,
                s.start_time               AS ShiftStart,
                s.end_time                 AS ShiftEnd,
                p.Proj_ID                  AS ProjectId,
                p.name                     AS ProjectName,
                es.actual_start_time       AS ActualStart,
                es.actual_end_time         AS ActualEnd,
                es.pay_rate_per_hour       AS PayRatePerHour,
                es.approved_regular_hours  AS ApprovedRegularHours,
                es.approved_overtime_hours AS ApprovedOvertimeHours,
                ISNULL(es.payment_status, '') AS PaymentStatus
            FROM Employee_Shift es
            INNER JOIN [User]   u  ON u.user_ID  = es.employee_user_ID
            INNER JOIN Shift    s  ON s.Shift_ID = es.shift_ID
            INNER JOIN Roll     r  ON r.Roll_ID  = s.roll_ID
            INNER JOIN Event    e  ON e.event_ID = s.event_ID
            INNER JOIN Project  p  ON p.Proj_ID  = e.project_ID
            WHERE u.FBUID = @firebaseUid
              AND es.status IN (
                  'employee_request',
                  'manager_approved',
                  'manager_reject',
                  'manager_approved_canceled'
              )
            ORDER BY COALESCE(e.start_time, s.start_time) DESC
            """;

        var results = new List<MyApplicationResponse>();

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);
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
        const string sql = """
            UPDATE Employee_Shift
            SET    actual_start_time  = @actualStart,
                   actual_end_time    = @actualEnd,
                   status_updated_at  = GETUTCDATE()
            WHERE  shift_ID           = @shiftId
              AND  employee_user_ID   = (SELECT user_ID FROM [User] WHERE FBUID = @fbuid)
              AND  status             = 'manager_approved'
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@shiftId",     shiftId);
        cmd.Parameters.AddWithValue("@fbuid",        firebaseUid);
        cmd.Parameters.AddWithValue("@actualStart",  (object?)actualStart ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@actualEnd",    (object?)actualEnd   ?? DBNull.Value);

        await conn.OpenAsync();
        var rows = await cmd.ExecuteNonQueryAsync();
        return rows > 0;
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  EVENT-SCOPED HELPERS
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>Returns the project_ID if the manager has access to the event; null otherwise.</summary>
    private async Task<string?> CheckEventAccessAsync(SqlConnection conn, string eventId, string firebaseUid)
    {
        const string sql = """
            SELECT p.Proj_ID
            FROM   Event e
            INNER JOIN Project         p  ON p.Proj_ID    = e.project_ID
            INNER JOIN Manager_Project mp ON mp.project_ID = p.Proj_ID
            INNER JOIN [User]          u  ON u.user_ID    = mp.manager_user_ID
            WHERE  e.event_ID = @eventId
              AND  u.FBUID    = @fbUid
            """;
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@eventId", eventId);
        cmd.Parameters.AddWithValue("@fbUid",   firebaseUid);
        return (string?)await cmd.ExecuteScalarAsync();
    }

    // ── Event Tasks ────────────────────────────────────────────────────────

    public async Task<IEnumerable<TaskItem>?> GetTasksByEventIdAsync(string eventId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        const string sql = """
            SELECT task_ID, content, status, priority
            FROM   Task
            WHERE  event_ID = @eventId
            ORDER  BY task_ID ASC
            """;
        var tasks = new List<TaskItem>();
        await using var cmd    = new SqlCommand(sql, conn);
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
        const string sql = """
            INSERT INTO Task (task_ID, content, status, priority, project_ID, event_ID, shift_ID)
            VALUES (@taskId, @content, @status, @priority, NULL, @eventId, NULL)
            """;
        await using var cmd = new SqlCommand(sql, conn);
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

        const string sql = """
            UPDATE Task SET content = @content, status = @status, priority = @priority
            WHERE  task_ID = @taskId AND event_ID = @eventId
            """;
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@content",  request.Content);
        cmd.Parameters.AddWithValue("@status",   request.Status);
        cmd.Parameters.AddWithValue("@priority", request.Priority);
        cmd.Parameters.AddWithValue("@taskId",   taskId);
        cmd.Parameters.AddWithValue("@eventId",  eventId);
        var rows = await cmd.ExecuteNonQueryAsync();
        if (rows == 0) return null;
        return new TaskItem { TaskId = taskId, Content = request.Content, Status = request.Status, Priority = request.Priority };
    }

    public async Task<bool?> DeleteEventTaskAsync(string taskId, string eventId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        const string sql = "DELETE FROM Task WHERE task_ID = @taskId AND event_ID = @eventId";
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@taskId",  taskId);
        cmd.Parameters.AddWithValue("@eventId", eventId);
        return await cmd.ExecuteNonQueryAsync() > 0;
    }

    // ── Event Briefs ───────────────────────────────────────────────────────

    public async Task<IEnumerable<BriefItem>?> GetBriefsByEventIdAsync(string eventId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        var sql = BriefSelectSql + " WHERE b.event_ID = @eventId ORDER BY b.created_at DESC";
        var briefs = new List<BriefItem>();
        await using var cmd    = new SqlCommand(sql, conn);
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

        string? managerUserId;
        await using (var rc = new SqlCommand("SELECT user_ID FROM [User] WHERE FBUID = @fb", conn))
        {
            rc.Parameters.AddWithValue("@fb", firebaseUid);
            managerUserId = (string?)await rc.ExecuteScalarAsync();
        }

        var newId = Guid.NewGuid().ToString();
        const string insertSql = """
            INSERT INTO Brief (brief_ID, title, content, created_at, created_by_manager_user_ID, project_ID, event_ID, shift_ID)
            VALUES (@briefId, @title, @content, @createdAt, @managerId, NULL, @eventId, NULL)
            """;
        await using var cmd = new SqlCommand(insertSql, conn);
        cmd.Parameters.AddWithValue("@briefId",   newId);
        cmd.Parameters.AddWithValue("@title",     request.Title);
        cmd.Parameters.AddWithValue("@content",   request.Content);
        cmd.Parameters.AddWithValue("@createdAt", DateTime.UtcNow);
        cmd.Parameters.AddWithValue("@managerId", (object?)managerUserId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@eventId",   eventId);
        await cmd.ExecuteNonQueryAsync();

        var sel = BriefSelectSql + " WHERE b.brief_ID = @briefId";
        await using var selCmd = new SqlCommand(sel, conn);
        selCmd.Parameters.AddWithValue("@briefId", newId);
        await using var reader = await selCmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return ReadBriefItem(reader);
    }

    public async Task<BriefItem?> UpdateEventBriefAsync(string briefId, string eventId, UpdateBriefRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        const string updateSql = """
            UPDATE Brief SET title = @title, content = @content
            WHERE  brief_ID = @briefId AND event_ID = @eventId
            """;
        await using var cmd = new SqlCommand(updateSql, conn);
        cmd.Parameters.AddWithValue("@title",   request.Title);
        cmd.Parameters.AddWithValue("@content", request.Content);
        cmd.Parameters.AddWithValue("@briefId", briefId);
        cmd.Parameters.AddWithValue("@eventId", eventId);
        var rows = await cmd.ExecuteNonQueryAsync();
        if (rows == 0) return null;

        var sel = BriefSelectSql + " WHERE b.brief_ID = @briefId";
        await using var selCmd = new SqlCommand(sel, conn);
        selCmd.Parameters.AddWithValue("@briefId", briefId);
        await using var reader = await selCmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return ReadBriefItem(reader);
    }

    public async Task<bool?> DeleteEventBriefAsync(string briefId, string eventId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        // delete acknowledgments first (FK constraint)
        await using (var dc = new SqlCommand("DELETE FROM Brief_Acknowledgment WHERE brief_ID = @briefId", conn))
        {
            dc.Parameters.AddWithValue("@briefId", briefId);
            await dc.ExecuteNonQueryAsync();
        }

        const string sql = "DELETE FROM Brief WHERE brief_ID = @briefId AND event_ID = @eventId";
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@briefId", briefId);
        cmd.Parameters.AddWithValue("@eventId", eventId);
        return await cmd.ExecuteNonQueryAsync() > 0;
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

    private const string ExpenseSelectSql = """
        SELECT ee.expense_ID, ee.event_ID, ee.expense_type, ee.description,
               ee.amount, ee.expense_date, ee.vendor_name, ee.notes,
               ee.created_by_manager_user_ID,
               u.firstName + ' ' + u.lastName AS manager_name
        FROM   Event_Expense ee
        LEFT JOIN [User] u ON u.user_ID = ee.created_by_manager_user_ID
        """;

    public async Task<IEnumerable<EventExpenseItem>?> GetEventExpensesAsync(string eventId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        var sql = ExpenseSelectSql + " WHERE ee.event_ID = @eventId ORDER BY ee.expense_date DESC";
        var list = new List<EventExpenseItem>();
        await using var cmd    = new SqlCommand(sql, conn);
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

        string? managerUserId;
        await using (var rc = new SqlCommand("SELECT user_ID FROM [User] WHERE FBUID = @fb", conn))
        {
            rc.Parameters.AddWithValue("@fb", firebaseUid);
            managerUserId = (string?)await rc.ExecuteScalarAsync();
        }

        var newId = Guid.NewGuid().ToString();
        const string insertSql = """
            INSERT INTO Event_Expense
              (expense_ID, event_ID, expense_type, description, amount, expense_date, vendor_name, created_by_manager_user_ID, notes)
            VALUES (@id, @eventId, @type, @desc, @amount, @date, @vendor, @managerId, @notes)
            """;
        await using var cmd = new SqlCommand(insertSql, conn);
        cmd.Parameters.AddWithValue("@id",        newId);
        cmd.Parameters.AddWithValue("@eventId",   eventId);
        cmd.Parameters.AddWithValue("@type",      request.ExpenseType);
        cmd.Parameters.AddWithValue("@desc",      (object?)request.Description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@amount",    (object?)request.Amount       ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@date",      (object?)request.ExpenseDate  ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@vendor",    (object?)request.VendorName   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@managerId", (object?)managerUserId        ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@notes",     (object?)request.Notes        ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync();

        var sel = ExpenseSelectSql + " WHERE ee.expense_ID = @id";
        await using var selCmd = new SqlCommand(sel, conn);
        selCmd.Parameters.AddWithValue("@id", newId);
        await using var reader = await selCmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return ReadExpense(reader);
    }

    public async Task<EventExpenseItem?> UpdateEventExpenseAsync(string expenseId, string eventId, UpdateExpenseRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        const string updateSql = """
            UPDATE Event_Expense
            SET expense_type = @type, description = @desc, amount = @amount,
                expense_date = @date, vendor_name = @vendor, notes = @notes
            WHERE expense_ID = @id AND event_ID = @eventId
            """;
        await using var cmd = new SqlCommand(updateSql, conn);
        cmd.Parameters.AddWithValue("@type",    request.ExpenseType);
        cmd.Parameters.AddWithValue("@desc",    (object?)request.Description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@amount",  (object?)request.Amount       ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@date",    (object?)request.ExpenseDate  ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@vendor",  (object?)request.VendorName   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@notes",   (object?)request.Notes        ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@id",      expenseId);
        cmd.Parameters.AddWithValue("@eventId", eventId);
        var rows = await cmd.ExecuteNonQueryAsync();
        if (rows == 0) return null;

        var sel = ExpenseSelectSql + " WHERE ee.expense_ID = @id";
        await using var selCmd = new SqlCommand(sel, conn);
        selCmd.Parameters.AddWithValue("@id", expenseId);
        await using var reader = await selCmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return ReadExpense(reader);
    }

    public async Task<bool?> DeleteEventExpenseAsync(string expenseId, string eventId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        const string sql = "DELETE FROM Event_Expense WHERE expense_ID = @id AND event_ID = @eventId";
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@id",      expenseId);
        cmd.Parameters.AddWithValue("@eventId", eventId);
        return await cmd.ExecuteNonQueryAsync() > 0;
    }

    // ── Event Payroll (Employee_Shift hours) ───────────────────────────────

    public async Task<IEnumerable<PayrollItem>?> GetEventPayrollAsync(string eventId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        const string sql = """
            SELECT
                u.user_ID           AS EmployeeUserId,
                u.FBUID             AS EmployeeFbUid,
                u.firstName         AS FirstName,
                u.lastName          AS LastName,
                es.shift_ID         AS ShiftId,
                r.Roll_name         AS RoleName,
                s.start_time        AS ShiftStart,
                s.end_time          AS ShiftEnd,
                es.actual_start_time          AS ActualStart,
                es.actual_end_time            AS ActualEnd,
                es.approved_regular_hours     AS ApprovedRegularHours,
                es.approved_overtime_hours    AS ApprovedOvertimeHours,
                es.pay_rate_per_hour          AS PayRatePerHour,
                es.overtime_rate_per_hour     AS OvertimeRatePerHour,
                es.travel_refund              AS TravelRefund,
                es.bonus_amount               AS BonusAmount,
                es.penalty_amount             AS PenaltyAmount,
                es.payment_status             AS PaymentStatus,
                es.status                     AS Status
            FROM Employee_Shift es
            INNER JOIN [User]  u  ON u.user_ID  = es.employee_user_ID
            INNER JOIN Shift   s  ON s.Shift_ID = es.shift_ID
            INNER JOIN Roll    r  ON r.Roll_ID  = s.roll_ID
            WHERE s.event_ID = @eventId
              AND es.status  = 'manager_approved'
            ORDER BY u.lastName, u.firstName, s.start_time
            """;

        var list = new List<PayrollItem>();
        await using var cmd    = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@eventId", eventId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            list.Add(new PayrollItem
            {
                EmployeeUserId        = reader.IsDBNull(reader.GetOrdinal("EmployeeUserId"))       ? "" : reader.GetString(reader.GetOrdinal("EmployeeUserId")),
                EmployeeFbUid         = reader.IsDBNull(reader.GetOrdinal("EmployeeFbUid"))        ? "" : reader.GetString(reader.GetOrdinal("EmployeeFbUid")),
                FirstName             = reader.IsDBNull(reader.GetOrdinal("FirstName"))            ? "" : reader.GetString(reader.GetOrdinal("FirstName")),
                LastName              = reader.IsDBNull(reader.GetOrdinal("LastName"))             ? "" : reader.GetString(reader.GetOrdinal("LastName")),
                ShiftId               = reader.IsDBNull(reader.GetOrdinal("ShiftId"))              ? "" : reader.GetString(reader.GetOrdinal("ShiftId")),
                RoleName              = reader.IsDBNull(reader.GetOrdinal("RoleName"))             ? "" : reader.GetString(reader.GetOrdinal("RoleName")),
                ShiftStart            = reader.IsDBNull(reader.GetOrdinal("ShiftStart"))           ? null : reader.GetDateTime(reader.GetOrdinal("ShiftStart")),
                ShiftEnd              = reader.IsDBNull(reader.GetOrdinal("ShiftEnd"))             ? null : reader.GetDateTime(reader.GetOrdinal("ShiftEnd")),
                ActualStart           = reader.IsDBNull(reader.GetOrdinal("ActualStart"))          ? null : reader.GetDateTime(reader.GetOrdinal("ActualStart")),
                ActualEnd             = reader.IsDBNull(reader.GetOrdinal("ActualEnd"))            ? null : reader.GetDateTime(reader.GetOrdinal("ActualEnd")),
                ApprovedRegularHours  = reader.IsDBNull(reader.GetOrdinal("ApprovedRegularHours")) ? null : reader.GetDecimal(reader.GetOrdinal("ApprovedRegularHours")),
                ApprovedOvertimeHours = reader.IsDBNull(reader.GetOrdinal("ApprovedOvertimeHours"))? null : reader.GetDecimal(reader.GetOrdinal("ApprovedOvertimeHours")),
                PayRatePerHour        = reader.IsDBNull(reader.GetOrdinal("PayRatePerHour"))       ? null : reader.GetDecimal(reader.GetOrdinal("PayRatePerHour")),
                OvertimeRatePerHour   = reader.IsDBNull(reader.GetOrdinal("OvertimeRatePerHour"))  ? null : reader.GetDecimal(reader.GetOrdinal("OvertimeRatePerHour")),
                TravelRefund          = reader.IsDBNull(reader.GetOrdinal("TravelRefund"))         ? null : reader.GetDecimal(reader.GetOrdinal("TravelRefund")),
                BonusAmount           = reader.IsDBNull(reader.GetOrdinal("BonusAmount"))          ? null : reader.GetDecimal(reader.GetOrdinal("BonusAmount")),
                PenaltyAmount         = reader.IsDBNull(reader.GetOrdinal("PenaltyAmount"))        ? null : reader.GetDecimal(reader.GetOrdinal("PenaltyAmount")),
                PaymentStatus         = reader.IsDBNull(reader.GetOrdinal("PaymentStatus"))        ? "unpaid" : reader.GetString(reader.GetOrdinal("PaymentStatus")),
                Status                = reader.IsDBNull(reader.GetOrdinal("Status"))               ? "" : reader.GetString(reader.GetOrdinal("Status")),
            });
        }
        return list;
    }

    public async Task<PayrollItem?> UpdatePayrollAsync(string shiftId, string employeeUserId, string eventId, UpdatePayrollRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        if (await CheckEventAccessAsync(conn, eventId, firebaseUid) == null) return null;

        const string sql = """
            UPDATE Employee_Shift
            SET actual_start_time         = @actualStart,
                actual_end_time           = @actualEnd,
                approved_regular_hours    = @regularHours,
                approved_overtime_hours   = @overtimeHours,
                pay_rate_per_hour         = @payRate,
                overtime_rate_per_hour    = @overtimeRate,
                travel_refund             = @travel,
                bonus_amount              = @bonus,
                penalty_amount            = @penalty,
                payment_status            = @paymentStatus,
                status_updated_at         = @now
            WHERE shift_ID         = @shiftId
              AND employee_user_ID = @employeeUserId
            """;
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@actualStart",    (object?)request.ActualStart           ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@actualEnd",      (object?)request.ActualEnd             ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@regularHours",   (object?)request.ApprovedRegularHours  ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@overtimeHours",  (object?)request.ApprovedOvertimeHours ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@payRate",        (object?)request.PayRatePerHour        ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@overtimeRate",   (object?)request.OvertimeRatePerHour   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@travel",         (object?)request.TravelRefund          ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@bonus",          (object?)request.BonusAmount           ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@penalty",        (object?)request.PenaltyAmount         ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@paymentStatus",  request.PaymentStatus);
        cmd.Parameters.AddWithValue("@now",            DateTime.UtcNow);
        cmd.Parameters.AddWithValue("@shiftId",        shiftId);
        cmd.Parameters.AddWithValue("@employeeUserId", employeeUserId);
        var rows = await cmd.ExecuteNonQueryAsync();
        if (rows == 0) return null;

        // Re-fetch via GetEventPayrollAsync pattern — just do a targeted SELECT
        const string sel = """
            SELECT u.user_ID AS EmployeeUserId, u.FBUID AS EmployeeFbUid, u.firstName AS FirstName,
                   u.lastName AS LastName, es.shift_ID AS ShiftId, r.Roll_name AS RoleName,
                   s.start_time AS ShiftStart, s.end_time AS ShiftEnd,
                   es.actual_start_time AS ActualStart, es.actual_end_time AS ActualEnd,
                   es.approved_regular_hours AS ApprovedRegularHours, es.approved_overtime_hours AS ApprovedOvertimeHours,
                   es.pay_rate_per_hour AS PayRatePerHour, es.overtime_rate_per_hour AS OvertimeRatePerHour,
                   es.travel_refund AS TravelRefund, es.bonus_amount AS BonusAmount, es.penalty_amount AS PenaltyAmount,
                   es.payment_status AS PaymentStatus, es.status AS Status
            FROM Employee_Shift es
            INNER JOIN [User] u ON u.user_ID = es.employee_user_ID
            INNER JOIN Shift  s ON s.Shift_ID = es.shift_ID
            INNER JOIN Roll   r ON r.Roll_ID  = s.roll_ID
            WHERE es.shift_ID = @shiftId AND es.employee_user_ID = @employeeUserId
            """;
        await using var selCmd = new SqlCommand(sel, conn);
        selCmd.Parameters.AddWithValue("@shiftId",        shiftId);
        selCmd.Parameters.AddWithValue("@employeeUserId", employeeUserId);
        await using var reader = await selCmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;
        return new PayrollItem
        {
            EmployeeUserId        = reader.GetString(reader.GetOrdinal("EmployeeUserId")),
            EmployeeFbUid         = reader.IsDBNull(reader.GetOrdinal("EmployeeFbUid"))         ? "" : reader.GetString(reader.GetOrdinal("EmployeeFbUid")),
            FirstName             = reader.IsDBNull(reader.GetOrdinal("FirstName"))              ? "" : reader.GetString(reader.GetOrdinal("FirstName")),
            LastName              = reader.IsDBNull(reader.GetOrdinal("LastName"))               ? "" : reader.GetString(reader.GetOrdinal("LastName")),
            ShiftId               = reader.GetString(reader.GetOrdinal("ShiftId")),
            RoleName              = reader.IsDBNull(reader.GetOrdinal("RoleName"))               ? "" : reader.GetString(reader.GetOrdinal("RoleName")),
            ShiftStart            = reader.IsDBNull(reader.GetOrdinal("ShiftStart"))             ? null : reader.GetDateTime(reader.GetOrdinal("ShiftStart")),
            ShiftEnd              = reader.IsDBNull(reader.GetOrdinal("ShiftEnd"))               ? null : reader.GetDateTime(reader.GetOrdinal("ShiftEnd")),
            ActualStart           = reader.IsDBNull(reader.GetOrdinal("ActualStart"))            ? null : reader.GetDateTime(reader.GetOrdinal("ActualStart")),
            ActualEnd             = reader.IsDBNull(reader.GetOrdinal("ActualEnd"))              ? null : reader.GetDateTime(reader.GetOrdinal("ActualEnd")),
            ApprovedRegularHours  = reader.IsDBNull(reader.GetOrdinal("ApprovedRegularHours"))   ? null : reader.GetDecimal(reader.GetOrdinal("ApprovedRegularHours")),
            ApprovedOvertimeHours = reader.IsDBNull(reader.GetOrdinal("ApprovedOvertimeHours"))  ? null : reader.GetDecimal(reader.GetOrdinal("ApprovedOvertimeHours")),
            PayRatePerHour        = reader.IsDBNull(reader.GetOrdinal("PayRatePerHour"))         ? null : reader.GetDecimal(reader.GetOrdinal("PayRatePerHour")),
            OvertimeRatePerHour   = reader.IsDBNull(reader.GetOrdinal("OvertimeRatePerHour"))    ? null : reader.GetDecimal(reader.GetOrdinal("OvertimeRatePerHour")),
            TravelRefund          = reader.IsDBNull(reader.GetOrdinal("TravelRefund"))           ? null : reader.GetDecimal(reader.GetOrdinal("TravelRefund")),
            BonusAmount           = reader.IsDBNull(reader.GetOrdinal("BonusAmount"))            ? null : reader.GetDecimal(reader.GetOrdinal("BonusAmount")),
            PenaltyAmount         = reader.IsDBNull(reader.GetOrdinal("PenaltyAmount"))          ? null : reader.GetDecimal(reader.GetOrdinal("PenaltyAmount")),
            PaymentStatus         = reader.IsDBNull(reader.GetOrdinal("PaymentStatus"))          ? "unpaid" : reader.GetString(reader.GetOrdinal("PaymentStatus")),
            Status                = reader.IsDBNull(reader.GetOrdinal("Status"))                 ? "" : reader.GetString(reader.GetOrdinal("Status")),
        };
    }

    // ── Brief Acknowledgment ───────────────────────────────────────────────

    public async Task<IEnumerable<AcknowledgmentItem>?> GetBriefAcknowledgmentsAsync(string briefId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        // verify manager has access to the project that owns this brief
        const string accessSql = """
            SELECT 1
            FROM   Brief b
            LEFT JOIN Project         p  ON p.Proj_ID    = b.project_ID
            LEFT JOIN Event            e  ON e.event_ID   = b.event_ID
            LEFT JOIN Project         ep ON ep.Proj_ID   = e.project_ID
            LEFT JOIN Manager_Project mp ON mp.project_ID = COALESCE(p.Proj_ID, ep.Proj_ID)
            LEFT JOIN [User]          mu ON mu.user_ID   = mp.manager_user_ID
            WHERE b.brief_ID = @briefId AND mu.FBUID = @fbUid
            """;
        await using (var ac = new SqlCommand(accessSql, conn))
        {
            ac.Parameters.AddWithValue("@briefId", briefId);
            ac.Parameters.AddWithValue("@fbUid",   firebaseUid);
            if (await ac.ExecuteScalarAsync() == null) return null;
        }

        // Determine brief scope (project / event / shift)
        string? scopeProjectId = null, scopeEventId = null, scopeShiftId = null;
        const string scopeSql = "SELECT project_ID, event_ID, shift_ID FROM Brief WHERE brief_ID = @briefId";
        await using (var sc = new SqlCommand(scopeSql, conn))
        {
            sc.Parameters.AddWithValue("@briefId", briefId);
            await using var sr = await sc.ExecuteReaderAsync();
            if (!await sr.ReadAsync()) return null;
            scopeProjectId = sr.IsDBNull(sr.GetOrdinal("project_ID")) ? null : sr.GetString(sr.GetOrdinal("project_ID"));
            scopeEventId   = sr.IsDBNull(sr.GetOrdinal("event_ID"))   ? null : sr.GetString(sr.GetOrdinal("event_ID"));
            scopeShiftId   = sr.IsDBNull(sr.GetOrdinal("shift_ID"))   ? null : sr.GetString(sr.GetOrdinal("shift_ID"));
        }

        // Select ALL relevant employees for this brief scope with their ack status
        string sql;
        string scopeId;
        if (scopeShiftId != null)
        {
            scopeId = scopeShiftId;
            sql = """
                SELECT DISTINCT u.user_ID AS EmployeeUserId, u.firstName AS FirstName, u.lastName AS LastName,
                       CAST(COALESCE(ba.is_read, 0) AS bit) AS IsRead, ba.read_at AS ReadAt
                FROM   Employee_Shift es
                INNER JOIN [User] u ON u.user_ID = es.employee_user_ID
                LEFT  JOIN Brief_Acknowledgment ba
                       ON ba.employee_user_ID = es.employee_user_ID AND ba.brief_ID = @briefId
                WHERE  es.shift_ID = @scopeId
                ORDER  BY u.lastName, u.firstName
                """;
        }
        else if (scopeEventId != null)
        {
            scopeId = scopeEventId;
            sql = """
                SELECT DISTINCT u.user_ID AS EmployeeUserId, u.firstName AS FirstName, u.lastName AS LastName,
                       CAST(COALESCE(ba.is_read, 0) AS bit) AS IsRead, ba.read_at AS ReadAt
                FROM   Employee_Shift es
                INNER JOIN Shift s ON s.Shift_ID = es.shift_ID
                INNER JOIN [User] u ON u.user_ID = es.employee_user_ID
                LEFT  JOIN Brief_Acknowledgment ba
                       ON ba.employee_user_ID = es.employee_user_ID AND ba.brief_ID = @briefId
                WHERE  s.event_ID = @scopeId
                ORDER  BY u.lastName, u.firstName
                """;
        }
        else
        {
            scopeId = scopeProjectId ?? "";
            sql = """
                SELECT DISTINCT u.user_ID AS EmployeeUserId, u.firstName AS FirstName, u.lastName AS LastName,
                       CAST(COALESCE(ba.is_read, 0) AS bit) AS IsRead, ba.read_at AS ReadAt
                FROM   Employee_Shift es
                INNER JOIN Shift s  ON s.Shift_ID  = es.shift_ID
                INNER JOIN Event e  ON e.event_ID  = s.event_ID
                INNER JOIN [User] u ON u.user_ID   = es.employee_user_ID
                LEFT  JOIN Brief_Acknowledgment ba
                       ON ba.employee_user_ID = es.employee_user_ID AND ba.brief_ID = @briefId
                WHERE  e.project_ID = @scopeId
                ORDER  BY u.lastName, u.firstName
                """;
        }

        var list = new List<AcknowledgmentItem>();
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@briefId", briefId);
        cmd.Parameters.AddWithValue("@scopeId", scopeId);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            list.Add(new AcknowledgmentItem
            {
                EmployeeUserId = reader.GetString(reader.GetOrdinal("EmployeeUserId")),
                FirstName      = reader.IsDBNull(reader.GetOrdinal("FirstName")) ? "" : reader.GetString(reader.GetOrdinal("FirstName")),
                LastName       = reader.IsDBNull(reader.GetOrdinal("LastName"))  ? "" : reader.GetString(reader.GetOrdinal("LastName")),
                IsRead         = reader.GetBoolean(reader.GetOrdinal("IsRead")),
                ReadAt         = reader.IsDBNull(reader.GetOrdinal("ReadAt")) ? null : reader.GetDateTime(reader.GetOrdinal("ReadAt")),
            });
        return list;
    }

    public async Task<bool> AcknowledgeBriefAsync(string briefId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        // Resolve employee user_ID from FBUID
        string? employeeUserId;
        await using (var rc = new SqlCommand("SELECT user_ID FROM [User] WHERE FBUID = @fb", conn))
        {
            rc.Parameters.AddWithValue("@fb", firebaseUid);
            employeeUserId = (string?)await rc.ExecuteScalarAsync();
        }
        if (employeeUserId == null) return false;

        // Upsert: if row exists update it, otherwise insert
        const string upsertSql = """
            IF EXISTS (SELECT 1 FROM Brief_Acknowledgment WHERE brief_ID = @briefId AND employee_user_ID = @userId)
                UPDATE Brief_Acknowledgment
                SET    is_read = 1, read_at = @now
                WHERE  brief_ID = @briefId AND employee_user_ID = @userId
            ELSE
                INSERT INTO Brief_Acknowledgment (brief_ID, employee_user_ID, is_read, read_at)
                VALUES (@briefId, @userId, 1, @now)
            """;
        await using var cmd = new SqlCommand(upsertSql, conn);
        cmd.Parameters.AddWithValue("@briefId", briefId);
        cmd.Parameters.AddWithValue("@userId",  employeeUserId);
        cmd.Parameters.AddWithValue("@now",     DateTime.UtcNow);
        await cmd.ExecuteNonQueryAsync();
        return true;
    }

    public async Task<IEnumerable<EmployeeBriefItem>?> GetBriefsForEmployeeAsync(string firebaseUid)
    {
        const string sql = """
            SELECT DISTINCT
                b.brief_ID, b.title, b.content, b.created_at,
                b.project_ID, b.event_ID, b.shift_ID,
                p.name   AS ProjectName,
                e.name   AS EventName,
                CAST(COALESCE(ba.is_read, 0) AS bit) AS IsAcknowledged,
                ba.read_at              AS AcknowledgedAt
            FROM Brief b
            -- Employee relevant if brief is for a project they work in
            LEFT JOIN Project p ON p.Proj_ID = b.project_ID
            LEFT JOIN Event   e ON e.event_ID = b.event_ID
            -- Find employee's shifts in relevant projects/events
            INNER JOIN (
                SELECT DISTINCT
                    s.event_ID,
                    e2.project_ID,
                    es.shift_ID,
                    u.FBUID
                FROM Employee_Shift es
                INNER JOIN [User]  u  ON u.user_ID  = es.employee_user_ID
                INNER JOIN Shift   s  ON s.Shift_ID = es.shift_ID
                INNER JOIN Event   e2 ON e2.event_ID = s.event_ID
                WHERE u.FBUID = @fbUid
                  AND es.status = 'manager_approved'
            ) emp ON (
                (b.project_ID IS NOT NULL AND b.project_ID = emp.project_ID)
             OR (b.event_ID   IS NOT NULL AND b.event_ID   = emp.event_ID)
             OR (b.shift_ID   IS NOT NULL AND b.shift_ID   = emp.shift_ID)
            )
            LEFT JOIN Brief_Acknowledgment ba
                ON ba.brief_ID = b.brief_ID
               AND ba.employee_user_ID = (SELECT user_ID FROM [User] WHERE FBUID = @fbUid)
            ORDER BY b.created_at DESC
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);
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
}
