namespace Teamgle.Api.Models.DTOs;

public class CustomerResponse
{
    public string CustomerId { get; set; } = string.Empty;
    public string CustomerCompanyName { get; set; } = string.Empty;
    public string? CompanyPhone { get; set; }
    public string? CompanyEmail { get; set; }
    public string? CompanyCity { get; set; }
    public string? BusinessNumber { get; set; }
    public DateTime? CreatedAt { get; set; }
}
