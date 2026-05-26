using System.Data;
using Microsoft.Data.SqlClient;
using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Repositories;

public class GamificationRepository : IGamificationRepository
{
    private readonly string _connectionString;

    public GamificationRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("myProjDB")
            ?? throw new InvalidOperationException("ConnectionStrings:myProjDB is not set.");
    }

    public async Task<string?> GetCompanyIdByFbUidAsync(string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_GetCompanyIdByFbUid", conn)
        {
            CommandType = CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@fbuid", firebaseUid);
        await conn.OpenAsync();
        var result = await cmd.ExecuteScalarAsync();
        return result as string;
    }

    public async Task<List<ShiftChampionItem>> GetShiftChampionsAsync(
        string companyId, string currentFbUid, DateTime? fromDate, DateTime? toDate)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_GetShiftChampions", conn)
        {
            CommandType = CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@companyId", companyId);
        cmd.Parameters.Add("@fromDate", SqlDbType.DateTime2).Value = (object?)fromDate ?? DBNull.Value;
        cmd.Parameters.Add("@toDate",   SqlDbType.DateTime2).Value = (object?)toDate   ?? DBNull.Value;

        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();

        var list = new List<ShiftChampionItem>();
        while (await reader.ReadAsync())
        {
            var fbUid      = reader["FbUid"].ToString()!;
            var eventCount = Convert.ToInt32(reader["EventCount"]);
            list.Add(new ShiftChampionItem
            {
                UserId       = reader["UserId"].ToString()!,
                Name         = reader["Name"].ToString()!,
                EventCount   = eventCount,
                Badge        = ComputeBadge(eventCount),
                IsCurrentUser = fbUid == currentFbUid,
            });
        }
        return list;
    }

    private static string? ComputeBadge(int count) => count switch
    {
        >= 20 => "shift_champion",
        >= 10 => "team_regular",
        >= 5  => "rising_star",
        _     => null,
    };
}
