namespace Teamgle.Api.Models.DTOs;

public class CreateTaskRequest
{
    public string Content  { get; set; } = string.Empty;
    public string Status   { get; set; } = string.Empty;
    public string Priority { get; set; } = string.Empty;
}
