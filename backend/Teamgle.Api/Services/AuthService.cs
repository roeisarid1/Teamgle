using FirebaseAdmin.Auth;
using Teamgle.Api.Models.DTOs;
using Teamgle.Api.Repositories;

namespace Teamgle.Api.Services;

public class AuthService : IAuthService
{
    private readonly IUserRepository _userRepo;

    public AuthService(IUserRepository userRepo)
    {
        _userRepo = userRepo;
    }

    // ── First Registration: eligibility check ─────────────────────────────
    public async Task<bool> IsEligibleForFirstRegistrationAsync(string email)
    {
        var user = await _userRepo.GetUnregisteredUserByEmailAsync(email);
        return user != null;
    }

    // ── First Registration: save Firebase UID ─────────────────────────────
    public async Task CompleteRegistrationAsync(string email, string firebaseUid)
    {
        // Safety: confirm the user is still eligible before writing.
        var user = await _userRepo.GetUnregisteredUserByEmailAsync(email);

        if (user == null)
            throw new InvalidOperationException(
                "User is not eligible for first registration. " +
                "Either the email does not exist in SQL or FBUID is already set.");

        await _userRepo.SaveFirebaseUidAsync(email, firebaseUid);
    }

    // ── Login: verify Firebase token and return profile ───────────────────
    public async Task<UserProfileResponse> VerifyLoginAsync(string idToken)
    {
        // 1. Verify the token with Firebase Admin SDK
        FirebaseToken decoded;
        try
        {
            decoded = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken);
        }
        catch (FirebaseAuthException ex)
        {
            throw new UnauthorizedAccessException($"Firebase token verification failed: {ex.Message}");
        }

        string firebaseUid = decoded.Uid;

        // 2. Look up the user in SQL by Firebase UID
        var user = await _userRepo.GetUserByFirebaseUidAsync(firebaseUid);

        if (user == null)
            throw new UnauthorizedAccessException(
                "Authenticated Firebase user has no matching record in the system database. " +
                "Please contact your administrator.");

        // 3. Build and return the safe profile
        return new UserProfileResponse
        {
            UserId      = user.UserId,
            Email       = user.Email ?? string.Empty,
            FirstName   = user.FirstName ?? string.Empty,
            LastName    = user.LastName ?? string.Empty,
            CompanyId   = user.CompanyId ?? string.Empty,
            Role        = user.IsManager ? "Manager" : "Employee",
            CostPerHour = user.IsEmployee ? user.CostPerHour : null
        };
    }
}
