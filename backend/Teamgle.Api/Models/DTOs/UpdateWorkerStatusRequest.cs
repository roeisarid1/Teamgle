namespace Teamgle.Api.Models.DTOs;

public class UpdateWorkerStatusRequest
{
    public string Status  { get; set; } = "";
    public string ShiftId { get; set; } = "";
}
