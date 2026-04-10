namespace Teamgle.Api.Models.DTOs;

public class PayrollItem
{
    public string    EmployeeUserId         { get; set; } = "";
    public string    EmployeeFbUid          { get; set; } = "";
    public string    FirstName              { get; set; } = "";
    public string    LastName               { get; set; } = "";
    public string    ShiftId                { get; set; } = "";
    public string    RoleName               { get; set; } = "";
    public DateTime? ShiftStart             { get; set; }
    public DateTime? ShiftEnd               { get; set; }
    public DateTime? ActualStart            { get; set; }
    public DateTime? ActualEnd              { get; set; }
    public decimal?  ApprovedRegularHours   { get; set; }
    public decimal?  ApprovedOvertimeHours  { get; set; }
    public DateTime? ApprovedAt             { get; set; }
    public string?   ApprovedByManagerUserId { get; set; }
    public decimal?  PayRatePerHour         { get; set; }
    public decimal?  DefaultPayRate         { get; set; }   // from Employee.cost_per_hour; only present when PayRatePerHour is null
    public decimal?  OvertimeRatePerHour    { get; set; }
    public decimal?  TravelRefund           { get; set; }
    public decimal?  BonusAmount            { get; set; }
    public decimal?  PenaltyAmount          { get; set; }
    public string    PaymentStatus          { get; set; } = "pending";
    public string    Status                 { get; set; } = "";
}

public class ApproveHoursRequest
{
    public decimal? ApprovedRegularHours  { get; set; }
    public decimal? ApprovedOvertimeHours { get; set; }
}

public class SavePayrollRequest
{
    public decimal? PayRatePerHour       { get; set; }
    public decimal? OvertimeRatePerHour  { get; set; }
    public decimal? TravelRefund         { get; set; }
    public decimal? BonusAmount          { get; set; }
    public decimal? PenaltyAmount        { get; set; }
    public string   PaymentStatus        { get; set; } = "pending";
}

// kept for backward-compat — no longer used by new endpoints
public class UpdatePayrollRequest
{
    public DateTime? ActualStart           { get; set; }
    public DateTime? ActualEnd             { get; set; }
    public decimal?  ApprovedRegularHours  { get; set; }
    public decimal?  ApprovedOvertimeHours { get; set; }
    public decimal?  PayRatePerHour        { get; set; }
    public decimal?  OvertimeRatePerHour   { get; set; }
    public decimal?  TravelRefund          { get; set; }
    public decimal?  BonusAmount           { get; set; }
    public decimal?  PenaltyAmount         { get; set; }
    public string    PaymentStatus         { get; set; } = "pending";
}
