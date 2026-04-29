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
    public async Task<IActionResult> DownloadInvoicePdf(string invoiceId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var inv = await _invoiceService.GetInvoiceByIdAsync(invoiceId, uid);
            if (inv == null) return NotFound(new { error = "Invoice not found." });

            var bytes = GenerateInvoicePdf(inv);
            var fileName = $"invoice-{inv.InvoiceNumber.Replace("/", "-")}.pdf";
            return File(bytes, "application/pdf", fileName);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating PDF for invoice {Id}", invoiceId);
            return StatusCode(500, new { error = "An unexpected error occurred." });
        }
    }

    private static byte[] GenerateInvoicePdf(InvoiceResponse inv)
    {
        string Fmt(DateTime? d) => d.HasValue ? d.Value.ToString("dd MMM yyyy") : "—";
        string FmtMoney(decimal m) => $"₪{m:N2}";
        string StatusLabel(string s) => s switch
        {
            "draft"     => "Draft",
            "sent"      => "Sent",
            "partial"   => "Partial",
            "paid"      => "Paid",
            "overdue"   => "Overdue",
            "cancelled" => "Cancelled",
            _           => s,
        };

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(40);
                page.DefaultTextStyle(x => x.FontSize(11).FontFamily("Arial"));

                page.Content().Column(col =>
                {
                    // Header
                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Text("Teamgle")
                            .FontSize(26).Bold().FontColor("#4F6EF7");
                        row.RelativeItem().AlignRight().Column(c =>
                        {
                            c.Item().Text("INVOICE").FontSize(22).Bold().FontColor("#1e293b");
                            c.Item().Text($"# {inv.InvoiceNumber}").FontSize(12).FontColor("#64748b");
                        });
                    });

                    col.Item().PaddingVertical(12).LineHorizontal(1).LineColor("#e2e8f0");

                    // Dates & status
                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text("Invoice Date").FontSize(9).FontColor("#94a3b8");
                            c.Item().Text(Fmt(inv.InvoiceDate)).Bold();
                        });
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text("Due Date").FontSize(9).FontColor("#94a3b8");
                            c.Item().Text(Fmt(inv.DueDate)).Bold();
                        });
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text("Status").FontSize(9).FontColor("#94a3b8");
                            c.Item().Text(StatusLabel(inv.PaymentStatus)).Bold();
                        });
                    });

                    col.Item().PaddingTop(20).Text("Bill To").FontSize(9).FontColor("#94a3b8");
                    col.Item().Text(inv.CustomerCompanyName ?? "—").Bold().FontSize(13);

                    if (!string.IsNullOrWhiteSpace(inv.ProjectName))
                    {
                        col.Item().PaddingTop(4).Text($"Project: {inv.ProjectName}").FontColor("#475569");
                        if (!string.IsNullOrWhiteSpace(inv.EventName))
                            col.Item().Text($"Event: {inv.EventName}").FontColor("#475569");
                    }

                    col.Item().PaddingVertical(20).LineHorizontal(1).LineColor("#e2e8f0");

                    // Amount table
                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.RelativeColumn(3);
                            c.RelativeColumn(1);
                        });

                        table.Header(h =>
                        {
                            h.Cell().Background("#f1f5f9").Padding(6).Text("Description").Bold();
                            h.Cell().Background("#f1f5f9").Padding(6).AlignRight().Text("Amount").Bold();
                        });

                        table.Cell().Padding(6).Text("Invoice Amount");
                        table.Cell().Padding(6).AlignRight().Text(FmtMoney(inv.InvoiceAmount));

                        table.Cell().Padding(6).Text("Paid");
                        table.Cell().Padding(6).AlignRight().Text(FmtMoney(inv.PaidAmount)).FontColor("#16a34a");

                        var balance = inv.InvoiceAmount - inv.PaidAmount;
                        table.Cell().Background("#f8fafc").Padding(6).Text("Balance Due").Bold();
                        table.Cell().Background("#f8fafc").Padding(6).AlignRight()
                            .Text(FmtMoney(balance)).Bold()
                            .FontColor(balance > 0 ? "#dc2626" : "#16a34a");
                    });

                    if (!string.IsNullOrWhiteSpace(inv.Notes))
                    {
                        col.Item().PaddingTop(20).Text("Notes").FontSize(9).FontColor("#94a3b8");
                        col.Item().Text(inv.Notes).FontColor("#475569");
                    }
                });

                page.Footer().AlignCenter()
                    .Text($"Generated by Teamgle · {DateTime.UtcNow:dd MMM yyyy}")
                    .FontSize(9).FontColor("#94a3b8");
            });
        }).GeneratePdf();
    }

    // ── DELETE /api/invoices/{invoiceId} (soft-cancel) ────────────────────
    [HttpDelete("{invoiceId}")]
    public async Task<IActionResult> DeleteInvoice(string invoiceId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var cancelled = await _invoiceService.DeleteInvoiceAsync(invoiceId, uid);
            if (!cancelled) return NotFound(new { error = "Invoice not found or already cancelled." });
            return NoContent();
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error cancelling invoice {Id}", invoiceId);
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
