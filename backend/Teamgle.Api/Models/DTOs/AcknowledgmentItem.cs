namespace Teamgle.Api.Models.DTOs;

public class AcknowledgmentItem
{
    public string    EmployeeUserId { get; set; } = "";
    public string    FirstName      { get; set; } = "";
    public string    LastName       { get; set; } = "";
    public bool      IsRead         { get; set; }
    public DateTime? ReadAt         { get; set; }
}

public class EmployeeBriefItem
{
    public string    BriefId    { get; set; } = "";
    public string    Title      { get; set; } = "";
    public string    Content    { get; set; } = "";
    public DateTime? CreatedAt  { get; set; }
    public string?   ProjectId  { get; set; }
    public string?   EventId    { get; set; }
    public string?   ShiftId    { get; set; }
    public string?   ProjectName { get; set; }
    public string?   EventName   { get; set; }
    public bool      IsAcknowledged { get; set; }
    public DateTime? AcknowledgedAt { get; set; }
}
