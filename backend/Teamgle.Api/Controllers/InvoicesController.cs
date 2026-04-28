using FirebaseAdmin.Auth;
using Microsoft.AspNetCore.Mvc;
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
