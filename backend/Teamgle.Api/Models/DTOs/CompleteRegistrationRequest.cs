namespace Teamgle.Api.Models.DTOs;

/// <summary>
/// Sent after Firebase successfully creates the user.
/// Backend saves the Firebase UID into the existing SQL User row.
/// </summary>
public class CompleteRegistrationRequest
{
    public string Email { get; set; } = string.Empty;
    public string FirebaseUid { get; set; } = string.Empty;
}
