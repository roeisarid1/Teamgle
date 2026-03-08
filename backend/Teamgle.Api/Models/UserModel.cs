namespace Teamgle.Api.Models;

/// <summary>
/// Mirrors the SQL [User] table row. Used internally — never sent to the client directly.
/// </summary>
public class UserModel
{
    public string UserId { get; set; } = string.Empty;
    public string? FbUid { get; set; }
    public string? Email { get; set; }
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public DateTime? DateOfBirth { get; set; }
    public string? PhoneNum { get; set; }
    public DateTime? CreatedAt { get; set; }
    public string? CompanyId { get; set; }

    // Populated by JOIN — not a column in [User]
    public bool IsManager { get; set; }
    public bool IsEmployee { get; set; }
    public decimal? CostPerHour { get; set; }
}
