using Teamgle.Api.Models;

namespace Teamgle.Api.Repositories;

public interface IUserRepository
{
    /// <summary>
    /// Returns the user row if the email exists in SQL and FBUID is NULL.
    /// Returns null if not found or already registered.
    /// </summary>
    Task<UserModel?> GetUnregisteredUserByEmailAsync(string email);

    /// <summary>
    /// Saves the Firebase UID into the existing User row identified by email.
    /// </summary>
    Task SaveFirebaseUidAsync(string email, string firebaseUid);

    /// <summary>
    /// Returns the full user profile (with role) for a given Firebase UID.
    /// Returns null if no user has this UID in SQL.
    /// </summary>
    Task<UserModel?> GetUserByFirebaseUidAsync(string firebaseUid);
}
