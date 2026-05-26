using Teamgle.Api.Models.DTOs;
using Teamgle.Api.Repositories;

namespace Teamgle.Api.Services;

public class GamificationService : IGamificationService
{
    private readonly IGamificationRepository _repo;

    public GamificationService(IGamificationRepository repo)
    {
        _repo = repo;
    }

    public async Task<List<ShiftChampionItem>?> GetShiftChampionsAsync(string firebaseUid, string period)
    {
        var companyId = await _repo.GetCompanyIdByFbUidAsync(firebaseUid);
        if (companyId == null) return null;

        DateTime? fromDate = null;
        DateTime? toDate   = null;
        if (period == "current_month")
        {
            var range = ComputeCurrentMonthRange();
            fromDate  = range.from;
            toDate    = range.to;
        }

        return await _repo.GetShiftChampionsAsync(companyId, firebaseUid, fromDate, toDate);
    }

    private static (DateTime from, DateTime to) ComputeCurrentMonthRange()
    {
        var now   = DateTime.UtcNow;
        var from  = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var to    = from.AddMonths(1);
        return (from, to);
    }
}
