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
}
