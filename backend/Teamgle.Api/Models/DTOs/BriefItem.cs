namespace Teamgle.Api.Models.DTOs;

public class BriefItem
{
    public string    BriefId              { get; set; } = string.Empty;
    public string    Title                { get; set; } = string.Empty;
    public string    Content              { get; set; } = string.Empty;
    public DateTime? CreatedAt            { get; set; }
    public string    CreatedByManagerId   { get; set; } = string.Empty;
    public string?   CreatedByManagerName { get; set; }
    public int       AckCount             { get; set; }   // employees who acknowledged
    public int       TotalRelevant        { get; set; }   // total employees in scope
}
