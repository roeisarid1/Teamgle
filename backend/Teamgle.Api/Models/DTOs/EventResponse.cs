namespace Teamgle.Api.Models.DTOs;

public class EventResponse
{
    public string EventId { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Location { get; set; }
    public DateTime? StartTime { get; set; }
    public DateTime? EndTime { get; set; }
    public string Status { get; set; } = "";
    public string? EventType { get; set; }
    public decimal? PlannedBudget { get; set; }
    public decimal? ExpectedRevenue { get; set; }
    public int? AttendeesCount { get; set; }
    public string? ProjectId    { get; set; }
    public string? CustomerId   { get; set; }
    public string? CustomerName { get; set; }
}
