namespace Teamgle.Api.Models.DTOs;

public class CreateShiftRequest
{
    public string RollId { get; set; } = string.Empty;
    public int RequiredQuantity { get; set; }
    public DateTime StartTime { get; set; }
    public DateTime EndTime { get; set; }
}
