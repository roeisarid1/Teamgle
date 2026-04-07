namespace Teamgle.Api.Models.DTOs;

public class JobOfferResponse
{
    public string    ShiftId           { get; set; } = "";
    public decimal?  PayRatePerHour    { get; set; }
    public string?   Notes             { get; set; }
    public DateTime? PlannedStartTime  { get; set; }
    public DateTime? PlannedEndTime    { get; set; }

    // From Shift (template times — used when planned times are null)
    public DateTime? ShiftStartTime    { get; set; }
    public DateTime? ShiftEndTime      { get; set; }

    // From Roll
    public string    RoleName          { get; set; } = "";

    // From Event
    public string    EventId           { get; set; } = "";
    public string    EventName         { get; set; } = "";
    public string?   EventLocation     { get; set; }
    public string?   EventType         { get; set; }
    public int?      AttendeesCount    { get; set; }

    // From Project
    public string    ProjectName       { get; set; } = "";

    // From Manager (is_owner = 1 on Manager_Project)
    public string    ManagerName       { get; set; } = "";
}
