namespace Teamgle.Api.Models.DTOs;

public class ShiftCancellationNotice
{
    public string    NoticeId    { get; set; } = "";
    public string?   EventName   { get; set; }
    public string?   RoleName    { get; set; }
    public DateTime? ShiftStart  { get; set; }
    public DateTime? ShiftEnd    { get; set; }
    public DateTime? EventStart  { get; set; }
    public DateTime  CancelledAt { get; set; }
}
