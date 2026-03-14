namespace Teamgle.Api.Models.DTOs;

public class ProjectResponse
{
    public string ProjId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? CustomerId { get; set; }
}
