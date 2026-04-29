namespace Teamgle.Api.Models.DTOs;

public class InvoiceResponse
{
    public string    InvoiceId           { get; set; } = "";
    public string?   EventId             { get; set; }
    public string?   ProjectId           { get; set; }
    public string    CustomerId          { get; set; } = "";
    public string    InvoiceNumber       { get; set; } = "";
    public DateTime? InvoiceDate         { get; set; }
    public DateTime? DueDate             { get; set; }
    public decimal   InvoiceAmount       { get; set; }
    public decimal   PaidAmount          { get; set; }
    public string    PaymentStatus       { get; set; } = "draft";
    public DateTime? PaymentDate         { get; set; }
    public DateTime? CreatedAt           { get; set; }
    public string?   Notes               { get; set; }
    public string?   CustomerCompanyName { get; set; }
    public string?   ProjectName         { get; set; }
    public string?   EventName           { get; set; }
}

public class CreateInvoiceRequest
{
    public string?   EventId       { get; set; }
    public string?   ProjectId     { get; set; }
    public string?   CustomerId    { get; set; }
    public string    InvoiceNumber { get; set; } = "";
    public DateTime  InvoiceDate   { get; set; }
    public DateTime  DueDate       { get; set; }
    public decimal   InvoiceAmount { get; set; }
    public string    PaymentStatus { get; set; } = "draft";
    public string?   Notes         { get; set; }
}

public class UpdateInvoiceRequest
{
    public string    InvoiceNumber { get; set; } = "";
    public DateTime  InvoiceDate   { get; set; }
    public DateTime  DueDate       { get; set; }
    public decimal   InvoiceAmount { get; set; }
    public string    PaymentStatus { get; set; } = "draft";
    public string?   Notes         { get; set; }
}

public class RecordPaymentRequest
{
    public decimal   PaidAmount     { get; set; }
    public DateTime? PaymentDate    { get; set; }
    public string?   PaymentStatus  { get; set; }
}

public class InvoiceSummaryResponse
{
    public decimal TotalInvoiced  { get; set; }
    public decimal TotalPaid      { get; set; }
    public decimal TotalOutstanding { get; set; }
    public decimal TotalOverdue   { get; set; }
    public int     Count          { get; set; }
}
