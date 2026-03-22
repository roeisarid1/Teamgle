namespace Teamgle.Api.Models.DTOs;

public class ProjectScheduleResponse
{
    public string ProjId { get; set; } = "";
    public string Name   { get; set; } = "";

    public List<ScheduleEventItem> Events { get; set; } = [];
}

public class ScheduleEventItem
{
    public string    EventId   { get; set; } = "";
    public string    EventName { get; set; } = "";
    public DateTime? StartTime { get; set; }
    public DateTime? EndTime   { get; set; }
    public string?   Location  { get; set; }

    public List<ScheduleShiftItem> Shifts { get; set; } = [];
}

public class ScheduleShiftItem
{
    public string    ShiftId          { get; set; } = "";
    public string    RoleId           { get; set; } = "";
    public string    RoleName         { get; set; } = "";
    public int       RequiredQuantity { get; set; }
    public int       StaffedCount     { get; set; }
    public DateTime? StartTime        { get; set; }
    public DateTime? EndTime          { get; set; }
}
