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

    // ── sp_GetManagerCompanyId (defined in sp_Customers.sql) ──────────────
    public async Task<string?> GetManagerCompanyIdAsync(string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_GetManagerCompanyId", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@fbuid", firebaseUid);
        await conn.OpenAsync();
        var result = await cmd.ExecuteScalarAsync();
        return result as string;
    }

    // ── sp_GetAllRoles ─────────────────────────────────────────────────────
    public async Task<List<RoleResponse>> GetAllRolesAsync(string companyId)
    {
        var roles = new List<RoleResponse>();
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_GetAllRoles", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
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

    // ── sp_RoleNameExistsForCompany ────────────────────────────────────────
    public async Task<bool> RoleNameExistsForCompanyAsync(string roleName, string companyId)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_RoleNameExistsForCompany", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@roleName",  roleName);
        cmd.Parameters.AddWithValue("@companyId", companyId);
        await conn.OpenAsync();
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
    }

    // ── sp_CreateRole ──────────────────────────────────────────────────────
    public async Task CreateRoleAsync(string roleName, string companyId)
    {
        var rollId = Guid.NewGuid().ToString();
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_CreateRole", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@rollId",    rollId);
        cmd.Parameters.AddWithValue("@roleName",  roleName.Trim().ToLower());
        cmd.Parameters.AddWithValue("@companyId", companyId);
        await conn.OpenAsync();
        await cmd.ExecuteNonQueryAsync();
    }

    // ── sp_ValidateRoleIds ─────────────────────────────────────────────────
    public async Task<bool> RoleIdsExistAsync(List<string> roleIds, string companyId)
    {
        if (roleIds.Count == 0) return false;
        var csv = string.Join(",", roleIds.Distinct());
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_ValidateRoleIds", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@roleIdsCsv", csv);
        cmd.Parameters.AddWithValue("@companyId",  companyId);
        await conn.OpenAsync();
        var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());
        return count == roleIds.Distinct().Count();
    }

    // ── sp_EmailExists ─────────────────────────────────────────────────────
    public async Task<bool> EmailExistsAsync(string email)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_EmailExists", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@email", email);
        await conn.OpenAsync();
        return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
    }

    // ── sp_GetEmployeesByCompany + sp_GetEmployeeRolesByCompany ──────────
    public async Task<List<EmployeeResponse>> GetEmployeesByCompanyAsync(string companyId)
    {
        var employees = new Dictionary<string, EmployeeResponse>();

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        await using (var cmd = new SqlCommand("sp_GetEmployeesByCompany", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        })
        {
            cmd.Parameters.AddWithValue("@companyId", companyId);
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var userId  = reader["user_ID"].ToString()!;
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

        await using (var cmd = new SqlCommand("sp_GetEmployeeRolesByCompany", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        })
        {
            cmd.Parameters.AddWithValue("@companyId", companyId);
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

    // ── sp_GetEmployeeById + sp_GetEmployeeRoles ──────────────────────────
    public async Task<EmployeeDetailResponse?> GetEmployeeByIdAsync(string userId, string companyId)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        EmployeeDetailResponse? emp = null;

        await using (var cmd = new SqlCommand("sp_GetEmployeeById", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        })
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

        await using (var cmd = new SqlCommand("sp_GetEmployeeRoles", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        })
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

    // ── sp_CreateEmployee ─────────────────────────────────────────────────
    public async Task<string> CreateEmployeeAsync(string companyId, CreateEmployeeRequest request)
    {
        var userId     = Guid.NewGuid().ToString();
        var roleIdsCsv = string.Join(",", request.RoleIds.Distinct());

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_CreateEmployee", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@userId",      userId);
        cmd.Parameters.AddWithValue("@email",       request.Email.Trim().ToLower());
        cmd.Parameters.AddWithValue("@firstName",   request.FirstName.Trim());
        cmd.Parameters.AddWithValue("@lastName",    request.LastName.Trim());
        cmd.Parameters.AddWithValue("@phoneNum",    (object?)request.PhoneNum?.Trim() ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@costPerHour", request.CostPerHour);
        cmd.Parameters.AddWithValue("@createdAt",   DateTime.UtcNow);
        cmd.Parameters.AddWithValue("@companyId",   companyId);
        cmd.Parameters.AddWithValue("@roleIdsCsv",  roleIdsCsv);
        await conn.OpenAsync();
        await cmd.ExecuteNonQueryAsync();
        return userId;
    }

    // ── sp_UpdateEmployee ─────────────────────────────────────────────────
    public async Task UpdateEmployeeAsync(string userId, string companyId, UpdateEmployeeRequest request)
    {
        var roleIdsCsv = string.Join(",", request.RoleIds.Distinct());

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_UpdateEmployee", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@userId",      userId);
        cmd.Parameters.AddWithValue("@companyId",   companyId);
        cmd.Parameters.AddWithValue("@firstName",   request.FirstName.Trim());
        cmd.Parameters.AddWithValue("@lastName",    request.LastName.Trim());
        cmd.Parameters.AddWithValue("@phoneNum",    (object?)request.PhoneNum?.Trim() ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@costPerHour", request.CostPerHour);
        cmd.Parameters.AddWithValue("@roleIdsCsv",  roleIdsCsv);
        await conn.OpenAsync();
        try
        {
            await cmd.ExecuteNonQueryAsync();
        }
        catch (SqlException ex) when (ex.State == 2)
        {
            throw new UnauthorizedAccessException(ex.Message);
        }
    }

    // ── sp_DeleteEmployee ─────────────────────────────────────────────────
    public async Task DeleteEmployeeAsync(string userId, string companyId)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_DeleteEmployee", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@userId",    userId);
        cmd.Parameters.AddWithValue("@companyId", companyId);
        await conn.OpenAsync();
        try
        {
            await cmd.ExecuteNonQueryAsync();
        }
        catch (SqlException ex) when (ex.State == 2)
        {
            throw new UnauthorizedAccessException(ex.Message);
        }
    }
}
