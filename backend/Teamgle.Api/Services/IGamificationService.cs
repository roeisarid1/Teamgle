using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Services;

public interface IGamificationService
{
    Task<List<ShiftChampionItem>?> GetShiftChampionsAsync(string firebaseUid, string period);
}
