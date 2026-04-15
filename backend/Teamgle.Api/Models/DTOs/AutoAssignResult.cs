namespace Teamgle.Api.Models.DTOs;

public class AutoAssignResult
{
    public int Required   { get; set; }   // required_quantity on the shift
    public int Assigned   { get; set; }   // how many were auto-assigned this run
    public int AlreadyApproved { get; set; }  // already manually approved (untouched)
    public int Standby    { get; set; }   // placed on hold/standby
    public string? Warning { get; set; }  // set when Assigned < (Required - AlreadyApproved)
}
