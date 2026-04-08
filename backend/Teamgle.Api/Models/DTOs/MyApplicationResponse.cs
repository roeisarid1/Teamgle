namespace Teamgle.Api.Models.DTOs;

public class MyApplicationResponse
{
    public string    ShiftId               { get; set; } = "";
    public string    Status                { get; set; } = "";
    public string    RoleName              { get; set; } = "";
    public string    EventId               { get; set; } = "";
    public string    EventName             { get; set; } = "";
    public string?   EventLocation         { get; set; }
    public DateTime? EventStart            { get; set; }
    public DateTime? EventEnd              { get; set; }
    public DateTime? ShiftStart            { get; set; }
    public DateTime? ShiftEnd              { get; set; }
    public string    ProjectId             { get; set; } = "";
    public string    ProjectName           { get; set; } = "";
    public DateTime? ActualStart           { get; set; }
    public DateTime? ActualEnd             { get; set; }
    public decimal?  PayRatePerHour        { get; set; }
    public decimal?  ApprovedRegularHours  { get; set; }
    public decimal?  ApprovedOvertimeHours { get; set; }
    public string    PaymentStatus         { get; set; } = "";
}

public class ReportHoursRequest
{
    public DateTime? ActualStart { get; set; }
    public DateTime? ActualEnd   { get; set; }
}
