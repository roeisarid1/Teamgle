namespace Teamgle.Api.Models.DTOs;

public class EmployeeDetailResponse
{
    public string UserId { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PhoneNum { get; set; } = string.Empty;
    public decimal? CostPerHour { get; set; }
    public List<RoleDetail> Roles { get; set; } = [];

    /// <summary>"Active" if FBUID is set, "Pending Registration" if null.</summary>
    public string RegistrationStatus { get; set; } = string.Empty;
}

public class RoleDetail
{
    public string RollId { get; set; } = string.Empty;
    public string RollName { get; set; } = string.Empty;
}
