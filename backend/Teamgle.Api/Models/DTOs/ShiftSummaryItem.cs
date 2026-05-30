namespace Teamgle.Api.Models.DTOs;

public class ShiftSummaryItem
{
    public string    ShiftId   { get; set; } = "";
    public string    RoleName  { get; set; } = "";
    public DateTime? StartTime { get; set; }
    public DateTime? EndTime   { get; set; }
}
