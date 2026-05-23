using FirebaseAdmin.Auth;
using Microsoft.AspNetCore.Mvc;
using Teamgle.Api.Models.DTOs;
using Teamgle.Api.Repositories;
using Teamgle.Api.Services;

namespace Teamgle.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(IAuthService authService, ILogger<AuthController> logger)
    {
        _authService = authService;
        _logger      = logger;
    }

    // ── POST /api/auth/check-first-registration ───────────────────────────
    // Frontend calls this BEFORE creating the Firebase account.
    // Returns 200 OK if eligible, 403 Forbidden if not.
    [HttpPost("check-first-registration")]
    public async Task<IActionResult> CheckFirstRegistration([FromBody] CheckRegistrationRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
            return BadRequest(new { error = "Email is required." });

        bool eligible = await _authService.IsEligibleForFirstRegistrationAsync(request.Email.Trim().ToLower());

        if (!eligible)
            return StatusCode(403, new
            {
                error = "This email is not eligible for registration. " +
                        "Either it does not exist in the system, or it has already been registered."
            });

        return Ok(new { message = "Eligible for first registration." });
    }

    // ── POST /api/auth/complete-registration ──────────────────────────────
    // Frontend calls this AFTER Firebase creates the account, sending the ID token.
    // Backend verifies the token, extracts UID + email, then saves UID to SQL.
    [HttpPost("complete-registration")]
    public async Task<IActionResult> CompleteRegistration([FromBody] CompleteRegistrationRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.IdToken))
            return BadRequest(new { error = "IdToken is required." });

        try
        {
            await _authService.CompleteRegistrationAsync(request.IdToken.Trim());
            return Ok(new { message = "Registration completed successfully." });
        }
        catch (UnauthorizedAccessException ex)
        {
            _logger.LogWarning("CompleteRegistration token invalid: {Message}", ex.Message);
            return Unauthorized(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning("CompleteRegistration blocked: {Message}", ex.Message);
            return StatusCode(403, new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error in CompleteRegistration");
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── POST /api/auth/verify-login ───────────────────────────────────────
    // Frontend calls this after Firebase login, sending the raw ID token.
    // Returns the user profile on success.
    [HttpPost("verify-login")]
    public async Task<IActionResult> VerifyLogin([FromBody] VerifyLoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.IdToken))
            return BadRequest(new { error = "IdToken is required." });

        try
        {
            var profile = await _authService.VerifyLoginAsync(request.IdToken);
            return Ok(profile);
        }
        catch (UnauthorizedAccessException ex)
        {
            _logger.LogWarning("VerifyLogin unauthorized: {Message}", ex.Message);
            return Unauthorized(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error in VerifyLogin");
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

}
