namespace Teamgle.Api.Models.DTOs;

public class PayrollItem
{
    public string    EmployeeUserId          { get; set; } = "";
    public string    EmployeeFbUid           { get; set; } = "";
    public string    FirstName               { get; set; } = "";
    public string    LastName                { get; set; } = "";
    public string    ShiftId                 { get; set; } = "";
    public string    RoleName                { get; set; } = "";
    public DateTime? ShiftStart              { get; set; }
    public DateTime? ShiftEnd                { get; set; }
    public DateTime? ActualStart             { get; set; }
    public DateTime? ActualEnd               { get; set; }
    // Bulk / override hours fields
    public DateTime? ShiftBulkStart          { get; set; }
    public DateTime? ShiftBulkEnd            { get; set; }
    public DateTime? ManagerOverrideStart    { get; set; }
    public DateTime? ManagerOverrideEnd      { get; set; }
    // "employee_report" | "shift_bulk" | "manager_override" | "none"
    public string    HoursSource             { get; set; } = "none";
    public decimal?  ApprovedRegularHours    { get; set; }
    public decimal?  ApprovedOvertimeHours   { get; set; }
    public DateTime? ApprovedAt              { get; set; }
    public string?   ApprovedByManagerUserId { get; set; }
    public decimal?  PayRatePerHour          { get; set; }
    public decimal?  DefaultPayRate          { get; set; }   // from Employee.cost_per_hour; only present when PayRatePerHour is null
    public decimal?  OvertimeRatePerHour     { get; set; }
    public decimal?  TravelRefund            { get; set; }
    public decimal?  BonusAmount             { get; set; }
    public decimal?  PenaltyAmount           { get; set; }
    public string    PaymentStatus           { get; set; } = "pending";
    public string    Status                  { get; set; } = "";
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

public class BulkShiftHoursRequest
{
    public DateTime? BulkActualStart { get; set; }
    public DateTime? BulkActualEnd   { get; set; }
}

public class ManagerOverrideHoursRequest
{
    public DateTime? ManagerActualStart { get; set; }
    public DateTime? ManagerActualEnd   { get; set; }
    public bool      ClearOverride      { get; set; }
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
