namespace Teamgle.Api.Models.DTOs;

public class EventWorkersResponse
{
    public List<AssignedWorkerItem> Applicants { get; set; } = [];
    public List<AssignedWorkerItem> Approved   { get; set; } = [];
    public List<AssignedWorkerItem> Hold       { get; set; } = [];
    public List<AssignedWorkerItem> Rejected   { get; set; } = [];
}

public class AssignedWorkerItem
{
    public string ShiftId   { get; set; } = "";
    public string UserId    { get; set; } = "";
    public string FbUid     { get; set; } = "";
    public string FirstName { get; set; } = "";
    public string LastName  { get; set; } = "";
    public string RoleName  { get; set; } = "";
    public string Status    { get; set; } = "";
}
