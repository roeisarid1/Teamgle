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

    // ── Get roles: global (no entry in Roll_company) + company-specific ───
    public async Task<List<RoleResponse>> GetAllRolesAsync(string companyId)
    {
        const string sql = """
            SELECT r.Roll_ID, r.Roll_name
            FROM Roll r
            LEFT JOIN Roll_company rc ON r.Roll_ID = rc.roll_ID
            WHERE rc.company_ID IS NULL OR rc.company_ID = @companyId
            ORDER BY r.Roll_name
            """;
        var roles = new List<RoleResponse>();

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@companyId", companyId);
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

    // ── Check if role name already exists for this company ─────────────────
    public async Task<bool> RoleNameExistsForCompanyAsync(string roleName, string companyId)
    {
        const string sql = """
            SELECT COUNT(*) FROM Roll r
            LEFT JOIN Roll_company rc ON r.Roll_ID = rc.roll_ID
            WHERE LOWER(r.Roll_name) = LOWER(@name)
              AND (rc.company_ID IS NULL OR rc.company_ID = @companyId)
            """;
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@name", roleName);
        cmd.Parameters.AddWithValue("@companyId", companyId);
        await conn.OpenAsync();
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
    }

    // ── Create a new company-specific role ─────────────────────────────────
    public async Task CreateRoleAsync(string roleName, string companyId)
    {
        var rollId = Guid.NewGuid().ToString();

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        await using var tx = conn.BeginTransaction();
        try
        {
            await using (var cmd = new SqlCommand("INSERT INTO Roll (Roll_ID, Roll_name) VALUES (@id, @name)", conn, tx))
            {
                cmd.Parameters.AddWithValue("@id",   rollId);
                cmd.Parameters.AddWithValue("@name", roleName.Trim().ToLower());
                await cmd.ExecuteNonQueryAsync();
            }

            await using (var cmd = new SqlCommand("INSERT INTO Roll_company (roll_ID, company_ID) VALUES (@rollId, @companyId)", conn, tx))
            {
                cmd.Parameters.AddWithValue("@rollId",    rollId);
                cmd.Parameters.AddWithValue("@companyId", companyId);
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

    // ── Validate that all provided role IDs belong to company or are global ─
    public async Task<bool> RoleIdsExistAsync(List<string> roleIds, string companyId)
    {
        if (roleIds.Count == 0) return false;

        var paramNames = roleIds.Select((_, i) => $"@r{i}").ToList();
        var sql = $"""
            SELECT COUNT(*) FROM Roll r
            LEFT JOIN Roll_company rc ON r.Roll_ID = rc.roll_ID
            WHERE r.Roll_ID IN ({string.Join(",", paramNames)})
              AND (rc.company_ID IS NULL OR rc.company_ID = @companyId)
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand(sql, conn);
        for (int i = 0; i < roleIds.Count; i++)
            cmd.Parameters.AddWithValue($"@r{i}", roleIds[i]);
        cmd.Parameters.AddWithValue("@companyId", companyId);

        await conn.OpenAsync();
        var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());
        return count == roleIds.Count;
    }

    // ── Check if an email already exists in User table ─────────────────────
    public async Task<bool> EmailExistsAsync(string email)
    {
        const string sql = "SELECT COUNT(*) FROM [User] WHERE LOWER(email) = LOWER(@email)";

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@email", email);

        await conn.OpenAsync();
        var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());
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

    // ── Get a single employee by userId (must belong to companyId) ────────
    public async Task<EmployeeDetailResponse?> GetEmployeeByIdAsync(string userId, string companyId)
    {
        const string empSql = """
            SELECT u.user_ID, u.firstName, u.lastName, u.email, u.phoneNum, u.FBUID, e.cost_per_hour
            FROM [User] u
            INNER JOIN Employee e ON u.user_ID = e.user_ID
            WHERE u.user_ID = @userId AND u.company_ID = @companyId
            """;

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        EmployeeDetailResponse? emp = null;

        await using (var cmd = new SqlCommand(empSql, conn))
        {
            cmd.Parameters.AddWithValue("@userId",    userId);
            cmd.Parameters.AddWithValue("@companyId", companyId);
            await using var reader = await cmd.ExecuteReaderAsync();

            if (await reader.ReadAsync())
            {
                var hasFbUid = reader["FBUID"] != DBNull.Value && !string.IsNullOrEmpty(reader["FBUID"].ToString());
                emp = new EmployeeDetailResponse
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

        if (emp == null) return null;

        const string roleSql = """
            SELECT er.roll_ID, r.Roll_name
            FROM Employee_Roll er
            INNER JOIN Roll r ON er.roll_ID = r.Roll_ID
            WHERE er.employee_user_ID = @userId
            """;

        await using (var cmd = new SqlCommand(roleSql, conn))
        {
            cmd.Parameters.AddWithValue("@userId", userId);
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                emp.Roles.Add(new RoleDetail
                {
                    RollId   = reader["roll_ID"].ToString()!,
                    RollName = reader["Roll_name"].ToString()!
                });
            }
        }

        return emp;
    }

    // ── Update employee fields + replace roles (transactional) ────────────
    public async Task UpdateEmployeeAsync(string userId, string companyId, UpdateEmployeeRequest request)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        await using var tx = conn.BeginTransaction();

        try
        {
            // Safety: confirm employee belongs to this company
            const string checkSql = """
                SELECT COUNT(*)
                FROM [User] u
                INNER JOIN Employee e ON u.user_ID = e.user_ID
                WHERE u.user_ID = @userId AND u.company_ID = @companyId
                """;
            await using (var cmd = new SqlCommand(checkSql, conn, tx))
            {
                cmd.Parameters.AddWithValue("@userId",    userId);
                cmd.Parameters.AddWithValue("@companyId", companyId);
                if (Convert.ToInt32(await cmd.ExecuteScalarAsync()) == 0)
                    throw new UnauthorizedAccessException("Employee not found or access denied.");
            }

            // 1. Update User fields
            const string userSql = """
                UPDATE [User]
                SET firstName = @firstName, lastName = @lastName, phoneNum = @phoneNum
                WHERE user_ID = @userId
                """;
            await using (var cmd = new SqlCommand(userSql, conn, tx))
            {
                cmd.Parameters.AddWithValue("@firstName", request.FirstName.Trim());
                cmd.Parameters.AddWithValue("@lastName",  request.LastName.Trim());
                cmd.Parameters.AddWithValue("@phoneNum",  (object?)request.PhoneNum?.Trim() ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@userId",    userId);
                await cmd.ExecuteNonQueryAsync();
            }

            // 2. Update Employee cost
            const string empSql = "UPDATE Employee SET cost_per_hour = @cost WHERE user_ID = @userId";
            await using (var cmd = new SqlCommand(empSql, conn, tx))
            {
                cmd.Parameters.AddWithValue("@cost",   request.CostPerHour);
                cmd.Parameters.AddWithValue("@userId", userId);
                await cmd.ExecuteNonQueryAsync();
            }

            // 3. Replace roles: delete all then re-insert
            await using (var cmd = new SqlCommand("DELETE FROM Employee_Roll WHERE employee_user_ID = @userId", conn, tx))
            {
                cmd.Parameters.AddWithValue("@userId", userId);
                await cmd.ExecuteNonQueryAsync();
            }

            foreach (var roleId in request.RoleIds.Distinct())
            {
                await using var cmd = new SqlCommand(
                    "INSERT INTO Employee_Roll (employee_user_ID, roll_ID) VALUES (@userId, @roleId)", conn, tx);
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

    // ── Delete employee: Employee_Roll → Employee → User (transactional) ──
    public async Task DeleteEmployeeAsync(string userId, string companyId)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        await using var tx = conn.BeginTransaction();

        try
        {
            // Safety: confirm employee belongs to this company
            const string checkSql = """
                SELECT COUNT(*)
                FROM [User] u
                INNER JOIN Employee e ON u.user_ID = e.user_ID
                WHERE u.user_ID = @userId AND u.company_ID = @companyId
                """;
            await using (var cmd = new SqlCommand(checkSql, conn, tx))
            {
                cmd.Parameters.AddWithValue("@userId",    userId);
                cmd.Parameters.AddWithValue("@companyId", companyId);
                if (Convert.ToInt32(await cmd.ExecuteScalarAsync()) == 0)
                    throw new UnauthorizedAccessException("Employee not found or access denied.");
            }

            // 1. Remove role assignments
            await using (var cmd = new SqlCommand("DELETE FROM Employee_Roll WHERE employee_user_ID = @userId", conn, tx))
            {
                cmd.Parameters.AddWithValue("@userId", userId);
                await cmd.ExecuteNonQueryAsync();
            }

            // 2. Remove Employee row
            await using (var cmd = new SqlCommand("DELETE FROM Employee WHERE user_ID = @userId", conn, tx))
            {
                cmd.Parameters.AddWithValue("@userId", userId);
                await cmd.ExecuteNonQueryAsync();
            }

            // 3. Remove User row (company_ID guard = extra safety)
            await using (var cmd = new SqlCommand(
                "DELETE FROM [User] WHERE user_ID = @userId AND company_ID = @companyId", conn, tx))
            {
                cmd.Parameters.AddWithValue("@userId",    userId);
                cmd.Parameters.AddWithValue("@companyId", companyId);
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

    // ── Create employee: User + Employee + Employee_Roll (transactional) ───
    public async Task<string> CreateEmployeeAsync(string companyId, CreateEmployeeRequest request)
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
            foreach (var roleId in request.RoleIds.Distinct())
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
        return userId;
    }
}
