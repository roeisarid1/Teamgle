namespace Teamgle.Api.Models.DTOs;

public class ProjectDetailResponse
{
    public string   ProjId       { get; set; } = "";
    public string   Name         { get; set; } = "";
    public DateTime? StartDate   { get; set; }
    public DateTime? EndDate     { get; set; }
    public string   Status       { get; set; } = "";
    public string?  CustomerName { get; set; }
    public int      EventCount   { get; set; }

    public List<EventDetailItem> Events { get; set; } = [];
}

public class EventDetailItem
{
    public string   EventId        { get; set; } = "";
    public string   Name           { get; set; } = "";
    public string?  Location       { get; set; }
    public DateTime? StartTime     { get; set; }
    public DateTime? EndTime       { get; set; }
    public string   Status         { get; set; } = "";
    public string?  EventType      { get; set; }
    public decimal? PlannedBudget  { get; set; }
    public decimal? ExpectedRevenue { get; set; }
}
