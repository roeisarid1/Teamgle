namespace Teamgle.Api.Models.DTOs;

public class ShiftChampionItem
{
    public string  UserId       { get; set; } = "";
    public string  Name         { get; set; } = "";
    public int     EventCount   { get; set; }
    public string? Badge        { get; set; }
    public bool    IsCurrentUser { get; set; }
}
