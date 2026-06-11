using System.Globalization;
using FirebaseAdmin.Auth;
using Microsoft.AspNetCore.Mvc;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using Teamgle.Api.Models.DTOs;
using Teamgle.Api.Services;

namespace Teamgle.Api.Controllers;

[ApiController]
[Route("api/invoices")]
public class InvoicesController : ControllerBase
{
    private readonly IInvoiceService _invoiceService;
    private readonly ILogger<InvoicesController> _logger;

    public InvoicesController(IInvoiceService invoiceService, ILogger<InvoicesController> logger)
    {
        _invoiceService = invoiceService;
        _logger = logger;
    }

    private async Task<string?> GetFirebaseUidAsync()
    {
        var authHeader = Request.Headers["Authorization"].FirstOrDefault();
        if (authHeader == null || !authHeader.StartsWith("Bearer "))
            return null;
        var idToken = authHeader["Bearer ".Length..].Trim();
        try
        {
            var decoded = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken);
            return decoded.Uid;
        }
        catch { return null; }
    }

    // ── GET /api/invoices ─────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetInvoices()
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            return Ok(await _invoiceService.GetInvoicesAsync(uid));
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching invoices");
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── GET /api/invoices/{invoiceId} ─────────────────────────────────────
    [HttpGet("{invoiceId}")]
    public async Task<IActionResult> GetInvoice(string invoiceId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var invoice = await _invoiceService.GetInvoiceByIdAsync(invoiceId, uid);
            if (invoice == null) return NotFound(new { error = "Invoice not found." });
            return Ok(invoice);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (KeyNotFoundException ex)        { return NotFound(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching invoice {Id}", invoiceId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── POST /api/invoices ────────────────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> CreateInvoice([FromBody] CreateInvoiceRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var invoice = await _invoiceService.CreateInvoiceAsync(request, uid);
            return StatusCode(201, invoice);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (KeyNotFoundException ex)        { return NotFound(new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating invoice");
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── PUT /api/invoices/{invoiceId} ─────────────────────────────────────
    [HttpPut("{invoiceId}")]
    public async Task<IActionResult> UpdateInvoice(string invoiceId, [FromBody] UpdateInvoiceRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var invoice = await _invoiceService.UpdateInvoiceAsync(invoiceId, request, uid);
            if (invoice == null) return NotFound(new { error = "Invoice not found." });
            return Ok(invoice);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (KeyNotFoundException ex)        { return NotFound(new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating invoice {Id}", invoiceId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── PUT /api/invoices/{invoiceId}/payment ─────────────────────────────
    [HttpPut("{invoiceId}/payment")]
    public async Task<IActionResult> RecordPayment(string invoiceId, [FromBody] RecordPaymentRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var invoice = await _invoiceService.RecordPaymentAsync(invoiceId, request, uid);
            if (invoice == null) return NotFound(new { error = "Invoice not found." });
            return Ok(invoice);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (KeyNotFoundException ex)        { return NotFound(new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error recording payment for invoice {Id}", invoiceId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── GET /api/invoices/{invoiceId}/pdf ─────────────────────────────────
    [HttpGet("{invoiceId}/pdf")]
    public async Task<IActionResult> DownloadInvoicePdf(string invoiceId, [FromQuery] string? lang = null)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var inv = await _invoiceService.GetInvoiceByIdAsync(invoiceId, uid);
            if (inv == null) return NotFound(new { error = "Invoice not found." });

            var isHebrew = string.Equals(lang, "he", StringComparison.OrdinalIgnoreCase);
            var bytes = GenerateInvoicePdf(inv, isHebrew);
            var prefix = isHebrew ? "דרישת-תשלום" : "payment-request";
            var fileName = $"{prefix}-{inv.InvoiceNumber.Replace("/", "-")}.pdf";
            return File(bytes, "application/pdf", fileName);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating PDF for invoice {Id}", invoiceId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    private static byte[] GenerateInvoicePdf(InvoiceResponse inv, bool isHebrew)
    {
        string T(string en, string he) => isHebrew ? he : en;
        string FmtDate(DateTime? d) => !d.HasValue ? "—"
            : d.Value.ToString(isHebrew ? "dd/MM/yyyy" : "dd MMM yyyy", CultureInfo.InvariantCulture);
        string Money(decimal m) => "₪" + m.ToString("N2", CultureInfo.InvariantCulture);
        var balance = inv.InvoiceAmount - inv.PaidAmount;

        const string Brand     = "#4F6EF7";
        const string BrandSoft = "#eef2ff";
        const string BrandPale = "#c7d2fe";
        const string Ink       = "#1e293b";
        const string Muted     = "#475569";
        const string Faint     = "#94a3b8";
        const string Line      = "#e2e8f0";
        const string Soft      = "#f8fafc";
        const string Green     = "#16a34a";
        const string Red       = "#dc2626";

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(0);
                page.DefaultTextStyle(x => x.FontSize(11).FontFamily("Arial").FontColor(Ink));

                page.Content().Column(col =>
                {
                    // ── Brand header band ─────────────────────────────────
                    // Teamgle pinned to the left edge, title to the right edge —
                    // valid in both directions, avoids the center-collision issue.
                    col.Item().Background(Brand).PaddingVertical(30).PaddingHorizontal(40).Row(row =>
                    {
                        row.RelativeItem().AlignMiddle().Column(c =>
                        {
                            c.Item().Text("Teamgle").FontSize(26).Bold().FontColor(Colors.White);
                            c.Item().Text(T("Workforce Management", "ניהול כוח אדם")).FontSize(9).FontColor(BrandPale);
                        });
                        row.RelativeItem().AlignMiddle().Column(c =>
                        {
                            c.Item().AlignRight().Text(T("PAYMENT REQUEST", "דרישת תשלום")).FontSize(20).Bold().FontColor(Colors.White);
                            c.Item().AlignRight().Text($"#{inv.InvoiceNumber}").FontSize(11).FontColor(BrandPale);
                        });
                    });

                    // ── Customer & dates ──────────────────────────────────
                    col.Item().PaddingHorizontal(40).PaddingTop(28).Row(row =>
                    {
                        void BillToBlock(ColumnDescriptor c, bool alignRight)
                        {
                            IContainer I() { var i = c.Item(); return alignRight ? i.AlignRight() : i; }
                            I().Text(T("BILL TO", "לכבוד")).FontSize(8.5f).FontColor(Faint);
                            I().PaddingTop(2).Text(inv.CustomerCompanyName ?? "—").FontSize(15).Bold();
                            if (!string.IsNullOrWhiteSpace(inv.EventName))
                                I().PaddingTop(3).Text($"{T("Event", "אירוע")}: {inv.EventName}").FontSize(10).FontColor(Muted);
                        }

                        void DatesBlock(ColumnDescriptor c, bool alignRight)
                        {
                            IContainer I() { var i = c.Item(); return alignRight ? i.AlignRight() : i; }
                            I().Text(T("REQUEST DATE", "תאריך דרישה")).FontSize(8.5f).FontColor(Faint);
                            I().PaddingTop(2).Text(FmtDate(inv.InvoiceDate)).Bold();
                            I().PaddingTop(10).Text(T("DUE DATE", "תאריך יעד")).FontSize(8.5f).FontColor(Faint);
                            I().PaddingTop(2).Text(FmtDate(inv.DueDate)).Bold();
                        }

                        if (isHebrew)
                        {
                            row.RelativeItem().Column(c => DatesBlock(c, false));
                            row.RelativeItem().Column(c => BillToBlock(c, true));
                        }
                        else
                        {
                            row.RelativeItem().Column(c => BillToBlock(c, false));
                            row.RelativeItem().Column(c => DatesBlock(c, true));
                        }
                    });

                    // ── Amounts table ─────────────────────────────────────
                    col.Item().PaddingHorizontal(40).PaddingTop(28).Table(table =>
                    {
                        IContainer BodyCell() =>
                            table.Cell().BorderBottom(1).BorderColor(Line).Padding(8);

                        if (isHebrew)
                        {
                            // RTL: amount column on the physical left, description on the right
                            table.ColumnsDefinition(c => { c.RelativeColumn(1); c.RelativeColumn(3); });

                            table.Header(h =>
                            {
                                h.Cell().Background(Soft).BorderBottom(1).BorderColor(Line).Padding(8)
                                    .Text("סכום").FontSize(9).Bold().FontColor(Muted);
                                h.Cell().Background(Soft).BorderBottom(1).BorderColor(Line).Padding(8)
                                    .AlignRight().Text("תיאור").FontSize(9).Bold().FontColor(Muted);
                            });

                            BodyCell().Text(Money(inv.InvoiceAmount));
                            BodyCell().AlignRight().Text("סכום דרישת התשלום");

                            BodyCell().Text(Money(inv.PaidAmount)).FontColor(Green);
                            BodyCell().AlignRight().Text("שולם עד כה");
                        }
                        else
                        {
                            table.ColumnsDefinition(c => { c.RelativeColumn(3); c.RelativeColumn(1); });

                            table.Header(h =>
                            {
                                h.Cell().Background(Soft).BorderBottom(1).BorderColor(Line).Padding(8)
                                    .Text("Description").FontSize(9).Bold().FontColor(Muted);
                                h.Cell().Background(Soft).BorderBottom(1).BorderColor(Line).Padding(8)
                                    .AlignRight().Text("Amount").FontSize(9).Bold().FontColor(Muted);
                            });

                            BodyCell().Text("Payment request amount");
                            BodyCell().AlignRight().Text(Money(inv.InvoiceAmount));

                            BodyCell().Text("Paid to date");
                            BodyCell().AlignRight().Text(Money(inv.PaidAmount)).FontColor(Green);
                        }
                    });

                    // ── Balance highlight ─────────────────────────────────
                    col.Item().PaddingHorizontal(40).PaddingTop(16)
                       .Background(BrandSoft).Padding(16).Row(row =>
                    {
                        var balanceColor = balance > 0 ? Red : Green;
                        if (isHebrew)
                        {
                            row.RelativeItem().AlignMiddle().Text(Money(balance)).FontSize(17).Bold().FontColor(balanceColor);
                            row.RelativeItem().AlignMiddle().AlignRight().Text("יתרה לתשלום").FontSize(13).Bold();
                        }
                        else
                        {
                            row.RelativeItem().AlignMiddle().Text("Balance Due").FontSize(13).Bold();
                            row.RelativeItem().AlignMiddle().AlignRight().Text(Money(balance)).FontSize(17).Bold().FontColor(balanceColor);
                        }
                    });

                    if (inv.PaidAmount > 0 && inv.PaymentDate.HasValue)
                    {
                        var paidLine = col.Item().PaddingHorizontal(40).PaddingTop(8);
                        (isHebrew ? paidLine.AlignRight() : paidLine)
                            .Text($"{T("Last payment", "תשלום אחרון")}: {FmtDate(inv.PaymentDate)}")
                            .FontSize(9).FontColor(Faint);
                    }

                    // ── Notes ─────────────────────────────────────────────
                    if (!string.IsNullOrWhiteSpace(inv.Notes))
                    {
                        col.Item().PaddingHorizontal(40).PaddingTop(24)
                           .Background(Soft).Padding(12).Column(c =>
                        {
                            IContainer I() { var i = c.Item(); return isHebrew ? i.AlignRight() : i; }
                            I().Text(T("NOTES", "הערות")).FontSize(8.5f).FontColor(Faint);
                            I().PaddingTop(4).Text(inv.Notes).FontSize(10).FontColor(Muted);
                        });
                    }
                });

                // ── Footer ────────────────────────────────────────────────
                page.Footer().PaddingHorizontal(40).PaddingBottom(28).Column(c =>
                {
                    c.Item().LineHorizontal(1).LineColor(Line);
                    c.Item().PaddingTop(10).AlignCenter().Text(t =>
                    {
                        t.Span(T("Generated by ", "הופק על ידי ")).FontSize(9).FontColor(Faint);
                        t.Span("Teamgle").FontSize(9).Bold().FontColor(Brand);
                        t.Span($" · {DateTime.UtcNow.ToString(isHebrew ? "dd/MM/yyyy" : "dd MMM yyyy", CultureInfo.InvariantCulture)}")
                            .FontSize(9).FontColor(Faint);
                    });
                });
            });
        }).GeneratePdf();
    }

    // ── DELETE /api/invoices/{invoiceId} ──────────────────────────────────
    [HttpDelete("{invoiceId}")]
    public async Task<IActionResult> DeleteInvoice(string invoiceId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var deleted = await _invoiceService.DeleteInvoiceAsync(invoiceId, uid);
            if (!deleted) return NotFound(new { error = "Invoice not found." });
            return NoContent();
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting invoice {Id}", invoiceId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }
}

[ApiController]
public class InvoiceSubResourceController : ControllerBase
{
    private readonly IInvoiceService _invoiceService;
    private readonly ILogger<InvoiceSubResourceController> _logger;

    public InvoiceSubResourceController(IInvoiceService invoiceService, ILogger<InvoiceSubResourceController> logger)
    {
        _invoiceService = invoiceService;
        _logger = logger;
    }

    private async Task<string?> GetFirebaseUidAsync()
    {
        var authHeader = Request.Headers["Authorization"].FirstOrDefault();
        if (authHeader == null || !authHeader.StartsWith("Bearer "))
            return null;
        var idToken = authHeader["Bearer ".Length..].Trim();
        try
        {
            var decoded = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken);
            return decoded.Uid;
        }
        catch { return null; }
    }

    // ── GET /api/projects/{projectId}/invoices ────────────────────────────
    [HttpGet("api/projects/{projectId}/invoices")]
    public async Task<IActionResult> GetByProject(string projectId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            return Ok(await _invoiceService.GetInvoicesByProjectAsync(projectId, uid));
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (KeyNotFoundException ex)        { return NotFound(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching invoices for project {Id}", projectId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── GET /api/events/{eventId}/invoices ────────────────────────────────
    [HttpGet("api/events/{eventId}/invoices")]
    public async Task<IActionResult> GetByEvent(string eventId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            return Ok(await _invoiceService.GetInvoicesByEventAsync(eventId, uid));
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (KeyNotFoundException ex)        { return NotFound(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching invoices for event {Id}", eventId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    // ── GET /api/customers/{customerId}/invoices ──────────────────────────
    [HttpGet("api/customers/{customerId}/invoices")]
    public async Task<IActionResult> GetByCustomer(string customerId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            return Ok(await _invoiceService.GetInvoicesByCustomerAsync(customerId, uid));
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (KeyNotFoundException ex)        { return NotFound(new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching invoices for customer {Id}", customerId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }
}
