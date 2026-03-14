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

        const string sql = """
            INSERT INTO Project
                (Proj_ID, name, start_date, end_date, status, customer_ID)
            VALUES
                (@projId, @name, @startDate, @endDate, 'planning', @customerId)
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand(sql, conn);

        cmd.Parameters.AddWithValue("@projId",     projId);
        cmd.Parameters.AddWithValue("@name",       request.Name.Trim());
        cmd.Parameters.AddWithValue("@startDate",  request.StartDate);
        cmd.Parameters.AddWithValue("@endDate",    request.EndDate);
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
