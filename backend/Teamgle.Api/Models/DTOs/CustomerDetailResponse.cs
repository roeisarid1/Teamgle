namespace Teamgle.Api.Models.DTOs;

public class CustomerDetailResponse
{
    public string CustomerId { get; set; } = string.Empty;
    public string CustomerCompanyName { get; set; } = string.Empty;
    public string? CompanyPhone { get; set; }
    public string? CompanyEmail { get; set; }
    public string? CompanyCity { get; set; }
    public string? CompanyAddress { get; set; }
    public string? BillingEmail { get; set; }
    public string? BusinessNumber { get; set; }
    public string? PaymentTerms { get; set; }
    public string? Notes { get; set; }
    public DateTime? CreatedAt { get; set; }
    public List<ContactPersonResponse> Contacts { get; set; } = [];
}
