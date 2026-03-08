namespace Teamgle.Api.Models.DTOs;

/// <summary>
/// Sent by frontend before creating a Firebase account.
/// Backend checks: does this email exist in SQL with FBUID = NULL?
/// </summary>
public class CheckRegistrationRequest
{
    public string Email { get; set; } = string.Empty;
}
