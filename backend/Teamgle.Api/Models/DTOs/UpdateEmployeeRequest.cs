namespace Teamgle.Api.Models.DTOs;

public class UpdateEmployeeRequest
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string PhoneNum { get; set; } = string.Empty;
    public decimal CostPerHour { get; set; }

    /// <summary>
    /// Full replacement of the employee's roles.
    /// Must reference existing Roll_IDs valid for this company.
    /// </summary>
    public List<string> RoleIds { get; set; } = [];
}
