namespace Teamgle.Api.Models.DTOs;

public class CreateEventStandaloneRequest
{
    public string   Name            { get; set; } = string.Empty;
    public DateTime StartTime       { get; set; }
    public DateTime EndTime         { get; set; }
    public string?  Location        { get; set; }
    public int?     AttendeesCount  { get; set; }
    public string?  EventType       { get; set; }
    public decimal? PlannedBudget   { get; set; }
    public decimal? ExpectedRevenue { get; set; }
    public string?  CustomerId      { get; set; }
    public string   Status          { get; set; } = "planning";
    public List<CreateShiftRequest> Shifts { get; set; } = [];
}
