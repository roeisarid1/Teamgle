namespace Teamgle.Api.BL;

public class ContactPerson
{
    public string ContactId { get; set; } = string.Empty;
    public string CustomerId { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? JobTitle { get; set; }
    public bool IsPrimary { get; set; }
    public string? Notes { get; set; }
    public DateTime? CreatedAt { get; set; }
}
