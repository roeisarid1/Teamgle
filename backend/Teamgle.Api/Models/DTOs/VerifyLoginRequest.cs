namespace Teamgle.Api.Models.DTOs;

/// <summary>
/// Sent after Firebase login. Contains the raw Firebase ID token.
/// Backend verifies the token and returns the user profile.
/// </summary>
public class VerifyLoginRequest
{
    public string IdToken { get; set; } = string.Empty;
}
