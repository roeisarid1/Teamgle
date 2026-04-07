namespace Teamgle.Api.Models.DTOs;

public class MyApplicationResponse
{
    public string    ShiftId      { get; set; } = "";
    public string    Status       { get; set; } = "";
    public string    RoleName     { get; set; } = "";
    public string    EventName    { get; set; } = "";
    public string?   EventLocation{ get; set; }
    public DateTime? ShiftStart   { get; set; }
    public DateTime? ShiftEnd     { get; set; }
    public string    ProjectName  { get; set; } = "";
}
