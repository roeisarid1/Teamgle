namespace Teamgle.Api.Models.DTOs;

public class EventExpenseItem
{
    public string    ExpenseId             { get; set; } = "";
    public string    EventId               { get; set; } = "";
    public string    ExpenseType           { get; set; } = "";
    public string?   Description           { get; set; }
    public decimal?  Amount                { get; set; }
    public DateTime? ExpenseDate           { get; set; }
    public string?   VendorName            { get; set; }
    public string?   Notes                 { get; set; }
    public string?   CreatedByManagerId    { get; set; }
    public string?   CreatedByManagerName  { get; set; }
}

public class CreateExpenseRequest
{
    public string    ExpenseType  { get; set; } = "";
    public string?   Description  { get; set; }
    public decimal?  Amount       { get; set; }
    public DateTime? ExpenseDate  { get; set; }
    public string?   VendorName   { get; set; }
    public string?   Notes        { get; set; }
}

public class UpdateExpenseRequest
{
    public string    ExpenseType  { get; set; } = "";
    public string?   Description  { get; set; }
    public decimal?  Amount       { get; set; }
    public DateTime? ExpenseDate  { get; set; }
    public string?   VendorName   { get; set; }
    public string?   Notes        { get; set; }
}
