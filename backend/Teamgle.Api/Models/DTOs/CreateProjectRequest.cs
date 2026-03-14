namespace Teamgle.Api.Models.DTOs;

public class CreateProjectRequest
{
    public string Name { get; set; } = string.Empty;
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public string? CustomerId { get; set; }
    public List<CreateEventRequest> Events { get; set; } = [];
}
