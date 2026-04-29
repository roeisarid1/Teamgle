namespace Teamgle.Api.Models.DTOs;

public class UpdateEventRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Location { get; set; }
    public DateTime StartTime { get; set; }
    public DateTime EndTime { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? EventType { get; set; }
    public decimal? PlannedBudget { get; set; }
    public decimal? ExpectedRevenue { get; set; }
    public int? AttendeesCount { get; set; }
}
