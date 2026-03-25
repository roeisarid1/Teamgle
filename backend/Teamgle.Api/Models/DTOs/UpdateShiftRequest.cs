namespace Teamgle.Api.Models.DTOs;

public class UpdateShiftRequest
{
    public string   RollId           { get; set; } = "";
    public DateTime StartTime        { get; set; }
    public DateTime EndTime          { get; set; }
    public int      RequiredQuantity { get; set; }
}
