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
    /// Verifies the Firebase ID token server-side, extracts UID + email,
    /// validates eligibility, and saves the UID to the SQL User row.
    /// </summary>
    Task CompleteRegistrationAsync(string idToken);

    /// <summary>
    /// Verifies a Firebase ID token, looks up the user in SQL by UID,
    /// and returns the safe user profile.
    /// </summary>
    Task<UserProfileResponse> VerifyLoginAsync(string idToken);
}
