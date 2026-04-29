namespace Teamgle.Api.Models.DTOs;

/// <summary>
/// Sent after Firebase successfully creates the user.
/// Backend verifies the ID token server-side and saves the UID.
/// </summary>
public class CompleteRegistrationRequest
{
    public string IdToken { get; set; } = string.Empty;
}
