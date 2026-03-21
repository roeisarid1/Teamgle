namespace Teamgle.Api.Models.DTOs;

public class TaskResponse
{
    public string TaskId      { get; set; } = "";
    public string Content     { get; set; } = "";
    public string Priority    { get; set; } = "";
    public string Status      { get; set; } = "";
    public string? ProjectId  { get; set; }
    public string? EventId    { get; set; }
    public string? ShiftId    { get; set; }
    public string? ProjectName { get; set; }
    public string? EventName   { get; set; }
}
