using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Repositories;

public interface IGamificationRepository
{
    Task<string?> GetCompanyIdByFbUidAsync(string firebaseUid);
    Task<List<ShiftChampionItem>> GetShiftChampionsAsync(string companyId, string currentFbUid, DateTime? fromDate, DateTime? toDate);
}
