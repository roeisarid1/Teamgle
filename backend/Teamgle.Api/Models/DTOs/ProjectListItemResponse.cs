namespace Teamgle.Api.Models.DTOs;

public class ProjectListItemResponse
{
    public string ProjId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public int EventCount { get; set; }
    public int StaffedCount { get; set; }
    public int RequiredCount { get; set; }
}
