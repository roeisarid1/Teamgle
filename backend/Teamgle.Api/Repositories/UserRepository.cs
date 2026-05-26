using System.Data;
using Microsoft.Data.SqlClient;
using Teamgle.Api.Models;

namespace Teamgle.Api.Repositories;

public class UserRepository : IUserRepository
{
    private readonly string _connectionString;

    public UserRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("myProjDB")
            ?? throw new InvalidOperationException(
                "ConnectionStrings:myProjDB is not set. " +
                "Add it to appsettings.Development.json.");
    }

    // ── Check first-registration eligibility ──────────────────────────────
    public async Task<UserModel?> GetUnregisteredUserByEmailAsync(string email)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_GetUnregisteredUserByEmail", conn)
        {
            CommandType = CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@email", email);

        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();

        if (!await reader.ReadAsync())
            return null;

        return MapUser(reader);
    }

    // ── Save Firebase UID after successful Firebase account creation ───────
    public async Task SaveFirebaseUidAsync(string email, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_SaveFirebaseUid", conn)
        {
            CommandType = CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@fbuid", firebaseUid);
        cmd.Parameters.AddWithValue("@email", email);

        await conn.OpenAsync();
        int rows = Convert.ToInt32(await cmd.ExecuteScalarAsync());

        if (rows == 0)
            throw new InvalidOperationException(
                "No rows updated. The user may not exist, or FBUID was already set.");
    }

    // ── Get user profile by Firebase UID (used during login) ──────────────
    public async Task<UserModel?> GetUserByFirebaseUidAsync(string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_GetUserByFirebaseUid", conn)
        {
            CommandType = CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@fbuid", firebaseUid);

        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();

        if (!await reader.ReadAsync())
            return null;

        return MapUser(reader);
    }

    // ── Shared mapping helper ──────────────────────────────────────────────
    private static UserModel MapUser(SqlDataReader r) => new()
    {
        UserId    = r["user_ID"].ToString()!,
        FbUid     = r["FBUID"] as string,
        Email     = r["email"] as string,
        FirstName = r["firstName"] as string,
        LastName  = r["lastName"] as string,
        DateOfBirth = r["DOB"] == DBNull.Value ? null : (DateTime?)r["DOB"],
        PhoneNum  = r["phoneNum"] as string,
        CreatedAt = r["created_at"] == DBNull.Value ? null : (DateTime?)r["created_at"],
        CompanyId = r["company_ID"] as string,
        IsManager  = Convert.ToInt32(r["IsManager"]) == 1,
        IsEmployee = Convert.ToInt32(r["IsEmployee"]) == 1,
        CostPerHour = r["cost_per_hour"] == DBNull.Value ? null : (decimal?)r["cost_per_hour"]
    };
}
