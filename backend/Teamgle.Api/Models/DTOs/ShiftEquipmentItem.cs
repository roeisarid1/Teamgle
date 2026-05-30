namespace Teamgle.Api.Models.DTOs;

public class ShiftEquipmentItem
{
    public string    EquipmentId              { get; set; } = "";
    public string    ShiftId                  { get; set; } = "";
    public string    Name                     { get; set; } = "";
    public int       Quantity                 { get; set; } = 1;
    public string?   Notes                    { get; set; }
    public DateTime? CreatedAt                { get; set; }
    public string?   CreatedByManagerName     { get; set; }
    public string?   EventId                  { get; set; }
    public string?   ProjectId                { get; set; }
}
