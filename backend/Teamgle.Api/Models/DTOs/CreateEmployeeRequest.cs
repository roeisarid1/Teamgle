namespace Teamgle.Api.Models.DTOs;

public class CreateEmployeeRequest
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PhoneNum { get; set; } = string.Empty;
    public decimal CostPerHour { get; set; }

    /// <summary>
    /// List of Roll_IDs selected by the manager.
    /// Must reference existing rows in the Roll table.
    /// </summary>
    public List<string> RoleIds { get; set; } = [];
}
