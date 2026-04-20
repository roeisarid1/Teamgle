using FirebaseAdmin.Auth;
using Microsoft.AspNetCore.Mvc;
using Teamgle.Api.Models.DTOs;
using Teamgle.Api.Services;

namespace Teamgle.Api.Controllers;

[ApiController]
[Route("api/customers")]
public class CustomersController : ControllerBase
{
    private readonly ICustomerService _customerService;
    private readonly ILogger<CustomersController> _logger;

    public CustomersController(ICustomerService customerService, ILogger<CustomersController> logger)
    {
        _customerService = customerService;
        _logger = logger;
    }

    private async Task<string?> GetFirebaseUidAsync()
    {
        var authHeader = Request.Headers["Authorization"].FirstOrDefault();
        if (authHeader == null || !authHeader.StartsWith("Bearer ")) return null;
        var idToken = authHeader["Bearer ".Length..].Trim();
        try { return (await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken)).Uid; }
        catch { return null; }
    }

    // GET /api/customers
    [HttpGet]
    public async Task<IActionResult> GetCustomers()
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            return Ok(await _customerService.GetCustomersAsync(uid));
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (Exception ex) { _logger.LogError(ex, "Error fetching customers"); return StatusCode(500, new { error = "An unexpected error occurred." }); }
    }

    // POST /api/customers
    [HttpPost]
    public async Task<IActionResult> CreateCustomer([FromBody] CreateCustomerRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var customerId = await _customerService.CreateCustomerAsync(uid, request);
            return Ok(new { message = "Customer created successfully.", customerId });
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (Exception ex) { _logger.LogError(ex, "Error creating customer"); return StatusCode(500, new { error = "An unexpected error occurred." }); }
    }

    // GET /api/customers/{id}
    [HttpGet("{id}")]
    public async Task<IActionResult> GetCustomer(string id)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            return Ok(await _customerService.GetCustomerByIdAsync(uid, id));
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (KeyNotFoundException ex)        { return NotFound(new { error = ex.Message }); }
        catch (Exception ex) { _logger.LogError(ex, "Error fetching customer {Id}", id); return StatusCode(500, new { error = "An unexpected error occurred." }); }
    }

    // PUT /api/customers/{id}
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateCustomer(string id, [FromBody] UpdateCustomerRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            await _customerService.UpdateCustomerAsync(uid, id, request);
            return Ok(new { message = "Customer updated successfully." });
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (KeyNotFoundException ex)        { return NotFound(new { error = ex.Message }); }
        catch (Exception ex) { _logger.LogError(ex, "Error updating customer {Id}", id); return StatusCode(500, new { error = "An unexpected error occurred." }); }
    }

    // DELETE /api/customers/{id}
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteCustomer(string id)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            await _customerService.DeleteCustomerAsync(uid, id);
            return Ok(new { message = "Customer deleted successfully." });
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (KeyNotFoundException ex)        { return NotFound(new { error = ex.Message }); }
        catch (Exception ex) { _logger.LogError(ex, "Error deleting customer {Id}", id); return StatusCode(500, new { error = "An unexpected error occurred." }); }
    }

    // GET /api/customers/{customerId}/contacts
    [HttpGet("{customerId}/contacts")]
    public async Task<IActionResult> GetContacts(string customerId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            return Ok(await _customerService.GetContactsAsync(uid, customerId));
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (KeyNotFoundException ex)        { return NotFound(new { error = ex.Message }); }
        catch (Exception ex) { _logger.LogError(ex, "Error fetching contacts for customer {CustomerId}", customerId); return StatusCode(500, new { error = "An unexpected error occurred." }); }
    }

    // POST /api/customers/{customerId}/contacts
    [HttpPost("{customerId}/contacts")]
    public async Task<IActionResult> CreateContact(string customerId, [FromBody] CreateContactPersonRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            var contactId = await _customerService.CreateContactAsync(uid, customerId, request);
            return Ok(new { message = "Contact person created successfully.", contactId });
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (KeyNotFoundException ex)        { return NotFound(new { error = ex.Message }); }
        catch (InvalidOperationException ex)   { return Conflict(new { error = ex.Message }); }
        catch (Exception ex) { _logger.LogError(ex, "Error creating contact for customer {CustomerId}", customerId); return StatusCode(500, new { error = "An unexpected error occurred." }); }
    }

    // GET /api/customers/{customerId}/contacts/{contactId}
    [HttpGet("{customerId}/contacts/{contactId}")]
    public async Task<IActionResult> GetContact(string customerId, string contactId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            return Ok(await _customerService.GetContactByIdAsync(uid, customerId, contactId));
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (KeyNotFoundException ex)        { return NotFound(new { error = ex.Message }); }
        catch (Exception ex) { _logger.LogError(ex, "Error fetching contact {ContactId}", contactId); return StatusCode(500, new { error = "An unexpected error occurred." }); }
    }

    // PUT /api/customers/{customerId}/contacts/{contactId}
    [HttpPut("{customerId}/contacts/{contactId}")]
    public async Task<IActionResult> UpdateContact(string customerId, string contactId, [FromBody] UpdateContactPersonRequest request)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            await _customerService.UpdateContactAsync(uid, customerId, contactId, request);
            return Ok(new { message = "Contact person updated successfully." });
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (ArgumentException ex)           { return BadRequest(new { error = ex.Message }); }
        catch (KeyNotFoundException ex)        { return NotFound(new { error = ex.Message }); }
        catch (Exception ex) { _logger.LogError(ex, "Error updating contact {ContactId}", contactId); return StatusCode(500, new { error = "An unexpected error occurred." }); }
    }

    // DELETE /api/customers/{customerId}/contacts/{contactId}
    [HttpDelete("{customerId}/contacts/{contactId}")]
    public async Task<IActionResult> DeleteContact(string customerId, string contactId)
    {
        var uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });
        try
        {
            await _customerService.DeleteContactAsync(uid, customerId, contactId);
            return Ok(new { message = "Contact person deleted successfully." });
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { error = ex.Message }); }
        catch (KeyNotFoundException ex)        { return NotFound(new { error = ex.Message }); }
        catch (Exception ex) { _logger.LogError(ex, "Error deleting contact {ContactId}", contactId); return StatusCode(500, new { error = "An unexpected error occurred." }); }
    }
}
