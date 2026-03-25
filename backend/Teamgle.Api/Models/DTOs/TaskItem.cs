namespace Teamgle.Api.Models.DTOs;

public class TaskItem
{
    public string TaskId   { get; set; } = string.Empty;
    public string Content  { get; set; } = string.Empty;
    public string Status   { get; set; } = string.Empty;  // open | in_progress | done | canceled
    public string Priority { get; set; } = string.Empty;  // low | medium | high | urgent
}
