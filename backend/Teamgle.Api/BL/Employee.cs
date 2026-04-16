namespace Teamgle.Api.BL;

public class Employee
{
    public string? UserId { get; set; }
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? Email { get; set; }
    public string? PhoneNum { get; set; }
    public decimal? CostPerHour { get; set; }
    public string? RegistrationStatus { get; set; }

    // Used in create / update requests (sent from the client)
    public List<string>? RoleIds { get; set; }

    // Used in get responses (populated by the DAL)
    public List<Role>? Roles { get; set; }
}

public class Role
{
    public string? RollId { get; set; }
    public string? RollName { get; set; }
}
