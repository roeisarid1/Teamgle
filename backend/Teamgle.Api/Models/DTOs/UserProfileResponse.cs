namespace Teamgle.Api.Models.DTOs;

/// <summary>
/// Returned to the frontend after successful login.
/// Safe to expose — contains no secrets or raw Firebase tokens.
/// </summary>
public class UserProfileResponse
{
    public string UserId { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string CompanyId { get; set; } = string.Empty;

    /// <summary>"Manager" or "Employee"</summary>
    public string Role { get; set; } = string.Empty;

    /// <summary>Only set for employees.</summary>
    public decimal? CostPerHour { get; set; }
}
