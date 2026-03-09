using Microsoft.Data.SqlClient;
using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Repositories;

public class EmployeeRepository : IEmployeeRepository
{
    private readonly string _connectionString;

    public EmployeeRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("myProjDB")
            ?? throw new InvalidOperationException("ConnectionStrings:myProjDB is not set.");
    }

    // ── Get all roles from Roll table ──────────────────────────────────────
    public async Task<List<RoleResponse>> GetAllRolesAsync()
    {
        const string sql = "SELECT Roll_ID, Roll_name FROM Roll ORDER BY Roll_name";
        var roles = new List<RoleResponse>();

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand(sql, conn);
        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            roles.Add(new RoleResponse
            {
                RollId   = reader["Roll_ID"].ToString()!,
                RollName = reader["Roll_name"].ToString()!
            });
        }
        return roles;
    }

    // ── Validate that all provided role IDs exist ──────────────────────────
    public async Task<bool> RoleIdsExistAsync(List<string> roleIds)
    {
        if (roleIds.Count == 0) return false;

        // Build parameterized IN clause
        var paramNames = roleIds.Select((_, i) => $"@r{i}").ToList();
        var sql = $"SELECT COUNT(*) FROM Roll WHERE Roll_ID IN ({string.Join(",", paramNames)})";

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand(sql, conn);
        for (int i = 0; i < roleIds.Count; i++)
            cmd.Parameters.AddWithValue($"@r{i}", roleIds[i]);

        await conn.OpenAsync();
        var count = (int)await cmd.ExecuteScalarAsync()!;
        return count == roleIds.Count;
    }

    // ── Check if an email already exists in User table ─────────────────────
    public async Task<bool> EmailExistsAsync(string email)
    {
        const string sql = "SELECT COUNT(*) FROM [User] WHERE email = @email";

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@email", email);

        await conn.OpenAsync();
        var count = (int)await cmd.ExecuteScalarAsync()!;
        return count > 0;
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
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@fbuid", firebaseUid);

        await conn.OpenAsync();
        var result = await cmd.ExecuteScalarAsync();
        return result as string;
    }

    // ── Get all employees for a company, with roles and status ────────────
    public async Task<List<EmployeeResponse>> GetEmployeesByCompanyAsync(string companyId)
    {
        // Fetch employees
        const string empSql = """
            SELECT
                u.user_ID,
                u.firstName,
                u.lastName,
                u.email,
                u.phoneNum,
                u.FBUID,
                e.cost_per_hour
            FROM [User] u
            INNER JOIN Employee e ON u.user_ID = e.user_ID
            WHERE u.company_ID = @companyId
            ORDER BY u.firstName, u.lastName
            """;

        var employees = new Dictionary<string, EmployeeResponse>();

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        await using (var cmd = new SqlCommand(empSql, conn))
        {
            cmd.Parameters.AddWithValue("@companyId", companyId);
            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var userId = reader["user_ID"].ToString()!;
                var hasFbUid = reader["FBUID"] != DBNull.Value && !string.IsNullOrEmpty(reader["FBUID"].ToString());

                employees[userId] = new EmployeeResponse
                {
                    UserId             = userId,
                    FirstName          = reader["firstName"]?.ToString() ?? "",
                    LastName           = reader["lastName"]?.ToString() ?? "",
                    Email              = reader["email"]?.ToString() ?? "",
                    PhoneNum           = reader["phoneNum"]?.ToString() ?? "",
                    CostPerHour        = reader["cost_per_hour"] == DBNull.Value ? null : (decimal?)reader["cost_per_hour"],
                    RegistrationStatus = hasFbUid ? "Active" : "Pending Registration",
                    Roles              = []
                };
            }
        }

        if (employees.Count == 0) return [];

        // Fetch roles for these employees
        var userIdParams = employees.Keys.Select((_, i) => $"@u{i}").ToList();
        var roleSql = $"""
            SELECT er.employee_user_ID, r.Roll_name
            FROM Employee_Roll er
            INNER JOIN Roll r ON er.roll_ID = r.Roll_ID
            WHERE er.employee_user_ID IN ({string.Join(",", userIdParams)})
            """;

        await using (var cmd = new SqlCommand(roleSql, conn))
        {
            int idx = 0;
            foreach (var uid in employees.Keys)
                cmd.Parameters.AddWithValue($"@u{idx++}", uid);

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var uid  = reader["employee_user_ID"].ToString()!;
                var role = reader["Roll_name"].ToString()!;
                if (employees.TryGetValue(uid, out var emp))
                    emp.Roles.Add(role);
            }
        }

        return [.. employees.Values];
    }

    // ── Create employee: User + Employee + Employee_Roll (transactional) ───
    public async Task CreateEmployeeAsync(string companyId, CreateEmployeeRequest request)
    {
        var userId = Guid.NewGuid().ToString();

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        await using var tx = conn.BeginTransaction();

        try
        {
            // 1. Insert into User
            const string userSql = """
                INSERT INTO [User]
                    (user_ID, FBUID, email, firstName, lastName, phoneNum, company_ID, created_at)
                VALUES
                    (@userId, NULL, @email, @firstName, @lastName, @phoneNum, @companyId, @createdAt)
                """;

            await using (var cmd = new SqlCommand(userSql, conn, tx))
            {
                cmd.Parameters.AddWithValue("@userId",    userId);
                cmd.Parameters.AddWithValue("@email",     request.Email.Trim().ToLower());
                cmd.Parameters.AddWithValue("@firstName", request.FirstName.Trim());
                cmd.Parameters.AddWithValue("@lastName",  request.LastName.Trim());
                cmd.Parameters.AddWithValue("@phoneNum",  request.PhoneNum.Trim());
                cmd.Parameters.AddWithValue("@companyId", companyId);
                cmd.Parameters.AddWithValue("@createdAt", DateTime.UtcNow);
                await cmd.ExecuteNonQueryAsync();
            }

            // 2. Insert into Employee
            const string empSql = """
                INSERT INTO Employee (user_ID, cost_per_hour, UID)
                VALUES (@userId, @costPerHour, NULL)
                """;

            await using (var cmd = new SqlCommand(empSql, conn, tx))
            {
                cmd.Parameters.AddWithValue("@userId",     userId);
                cmd.Parameters.AddWithValue("@costPerHour", request.CostPerHour);
                await cmd.ExecuteNonQueryAsync();
            }

            // 3. Insert into Employee_Roll for each role
            foreach (var roleId in request.RoleIds)
            {
                const string rollSql = """
                    INSERT INTO Employee_Roll (employee_user_ID, roll_ID)
                    VALUES (@userId, @roleId)
                    """;

                await using var cmd = new SqlCommand(rollSql, conn, tx);
                cmd.Parameters.AddWithValue("@userId", userId);
                cmd.Parameters.AddWithValue("@roleId", roleId);
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
}
