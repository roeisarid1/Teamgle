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

    public CustomersController(ICustomerService customerService)
    {
        _customerService = customerService;
    }

    // Extracts the Firebase ID token from the Authorization header,
    // verifies it, and returns the user's UID.
    // Returns null if the token is missing or invalid.
    private async Task<string?> GetFirebaseUidAsync()
    {
        string? authHeader = Request.Headers["Authorization"].FirstOrDefault();
        if (authHeader == null || !authHeader.StartsWith("Bearer "))
            return null;

        string idToken = authHeader.Substring("Bearer ".Length).Trim();
        try
        {
            FirebaseToken decoded = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken);
            return decoded.Uid;
        }
        catch
        {
            return null;
        }
    }

    // GET /api/customers
    // Returns all customers for the manager's company.
    [HttpGet]
    public async Task<IActionResult> GetCustomers()
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            List<CustomerResponse> customers = await _customerService.GetCustomersAsync(uid);
            return Ok(customers);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    // POST /api/customers
    // Creates a new customer and returns the new customer ID.
    [HttpPost]
    public async Task<IActionResult> CreateCustomer([FromBody] CreateCustomerRequest request)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            string customerId = await _customerService.CreateCustomerAsync(uid, request);
            return Ok(new { message = "Customer created successfully.", customerId });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    // GET /api/customers/{id}
    // Returns full details for one customer including its contacts.
    [HttpGet("{id}")]
    public async Task<IActionResult> GetCustomer(string id)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            CustomerDetailResponse customer = await _customerService.GetCustomerByIdAsync(uid, id);
            return Ok(customer);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    // PUT /api/customers/{id}
    // Updates an existing customer.
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateCustomer(string id, [FromBody] UpdateCustomerRequest request)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            await _customerService.UpdateCustomerAsync(uid, id, request);
            return Ok(new { message = "Customer updated successfully." });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    // DELETE /api/customers/{id}
    // Deletes a customer and all its contact persons.
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteCustomer(string id)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            await _customerService.DeleteCustomerAsync(uid, id);
            return Ok(new { message = "Customer deleted successfully." });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    // GET /api/customers/{customerId}/contacts
    // Returns all contact persons for a customer.
    [HttpGet("{customerId}/contacts")]
    public async Task<IActionResult> GetContacts(string customerId)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            List<ContactPersonResponse> contacts = await _customerService.GetContactsAsync(uid, customerId);
            return Ok(contacts);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    // POST /api/customers/{customerId}/contacts
    // Creates a new contact person for a customer.
    [HttpPost("{customerId}/contacts")]
    public async Task<IActionResult> CreateContact(string customerId, [FromBody] CreateContactPersonRequest request)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            string contactId = await _customerService.CreateContactAsync(uid, customerId, request);
            return Ok(new { message = "Contact person created successfully.", contactId });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    // GET /api/customers/{customerId}/contacts/{contactId}
    // Returns one contact person.
    [HttpGet("{customerId}/contacts/{contactId}")]
    public async Task<IActionResult> GetContact(string customerId, string contactId)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            ContactPersonResponse contact = await _customerService.GetContactByIdAsync(uid, customerId, contactId);
            return Ok(contact);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    // PUT /api/customers/{customerId}/contacts/{contactId}
    // Updates an existing contact person.
    [HttpPut("{customerId}/contacts/{contactId}")]
    public async Task<IActionResult> UpdateContact(string customerId, string contactId, [FromBody] UpdateContactPersonRequest request)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            await _customerService.UpdateContactAsync(uid, customerId, contactId, request);
            return Ok(new { message = "Contact person updated successfully." });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    // DELETE /api/customers/{customerId}/contacts/{contactId}
    // Deletes a contact person.
    [HttpDelete("{customerId}/contacts/{contactId}")]
    public async Task<IActionResult> DeleteContact(string customerId, string contactId)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null)
            return Unauthorized(new { error = "Valid Firebase token required." });

        try
        {
            await _customerService.DeleteContactAsync(uid, customerId, contactId);
            return Ok(new { message = "Contact person deleted successfully." });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }
}
