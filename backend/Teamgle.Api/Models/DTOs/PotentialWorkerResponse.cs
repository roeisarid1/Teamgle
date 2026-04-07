namespace Teamgle.Api.Models.DTOs;

public class PotentialWorkerResponse
{
    public string   UserId      { get; set; } = "";
    public string   FbUid       { get; set; } = "";
    public string   FirstName   { get; set; } = "";
    public string   LastName    { get; set; } = "";
    public decimal? CostPerHour { get; set; }

    public List<EligibleShiftItem> EligibleShifts { get; set; } = [];
}

public class EligibleShiftItem
{
    public string    ShiftId           { get; set; } = "";
    public string    RoleId            { get; set; } = "";
    public string    RoleName          { get; set; } = "";
    public DateTime? StartTime         { get; set; }
    public DateTime? EndTime           { get; set; }
    public int       RequiredQuantity  { get; set; }
    public int       ActiveAssignments { get; set; }
}
