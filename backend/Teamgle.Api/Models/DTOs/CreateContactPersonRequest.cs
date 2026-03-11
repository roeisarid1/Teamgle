namespace Teamgle.Api.Models.DTOs;

public class CreateContactPersonRequest
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? JobTitle { get; set; }
    public bool IsPrimary { get; set; }
    public string? Notes { get; set; }
}
