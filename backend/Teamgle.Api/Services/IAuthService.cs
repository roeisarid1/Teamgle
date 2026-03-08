using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Services;

public interface IAuthService
{
    /// <summary>
    /// Checks whether the given email is eligible for first registration.
    /// Eligible = email exists in SQL AND FBUID is NULL.
    /// </summary>
    Task<bool> IsEligibleForFirstRegistrationAsync(string email);

    /// <summary>
    /// Saves the Firebase UID to the SQL User row.
    /// Called after Firebase successfully creates the account.
    /// </summary>
    Task CompleteRegistrationAsync(string email, string firebaseUid);

    /// <summary>
    /// Verifies a Firebase ID token, looks up the user in SQL by UID,
    /// and returns the safe user profile.
    /// </summary>
    Task<UserProfileResponse> VerifyLoginAsync(string idToken);
}
