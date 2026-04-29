namespace Teamgle.Api.Models.DTOs;

public class AutoAssignResult
{
    public int Required   { get; set; }   // required_quantity on the shift
    public int Assigned   { get; set; }   // how many were auto-assigned this run
    public int AlreadyApproved { get; set; }  // already manually approved (untouched)
    public int Standby    { get; set; }   // placed on hold/standby
    public string? Warning { get; set; }  // set when Assigned < (Required - AlreadyApproved)
    public string ShiftId { get; set; } = "";
    public string RoleName { get; set; } = "";
    public DateTime? ShiftStart { get; set; }
    public DateTime? ShiftEnd { get; set; }
    public List<AutoAssignWorkerDecision> Decisions { get; set; } = [];
}

public class AutoAssignWorkerDecision
{
    public string UserId { get; set; } = "";
    public string FbUid { get; set; } = "";
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string Decision { get; set; } = ""; // assigned | standby
    public int Rank { get; set; }
    public double TotalScore { get; set; }
    public double CommitmentRate { get; set; }
    public double CommitmentScore { get; set; }
    public double AttendanceMinutesLateAvg { get; set; }
    public double AttendanceScore { get; set; }
    public double RoleExperienceRate { get; set; }
    public double RoleFitScore { get; set; }
    public double CostPerHour { get; set; }
    public double CostScore { get; set; }
    public string Explanation { get; set; } = "";
}
