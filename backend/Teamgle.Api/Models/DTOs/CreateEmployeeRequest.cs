namespace Teamgle.Api.Models.DTOs;

public class CreateEmployeeRequest
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PhoneNum { get; set; } = string.Empty;
    public decimal CostPerHour { get; set; }
    public List<string> RoleIds { get; set; } = [];
}
