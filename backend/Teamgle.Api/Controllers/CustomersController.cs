using FirebaseAdmin.Auth;
using Microsoft.AspNetCore.Mvc;
using Teamgle.Api.BL;
using Teamgle.Api.DAL;

namespace Teamgle.Api.Controllers;

[ApiController]
[Route("api/customers")]
public class CustomersController : ControllerBase
{
    private async Task<string?> GetFirebaseUidAsync()
    {
        var authHeader = Request.Headers["Authorization"].FirstOrDefault();
        if (authHeader == null || !authHeader.StartsWith("Bearer ")) return null;
        string idToken = authHeader["Bearer ".Length..].Trim();
        try { return (await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken)).Uid; }
        catch { return null; }
    }

    // GET /api/customers
    [HttpGet]
    public async Task<IActionResult> GetCustomers()
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });

        CustomerDAL dal = new CustomerDAL();

        string? companyId = dal.GetManagerCompanyId(uid);
        if (companyId == null) return StatusCode(403, new { error = "User is not a registered manager." });

        return Ok(dal.GetCustomersByCompany(companyId));
    }

    // POST /api/customers
    [HttpPost]
    public async Task<IActionResult> CreateCustomer([FromBody] Customer customer)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });

        if (string.IsNullOrWhiteSpace(customer.CustomerCompanyName))
            return BadRequest(new { error = "Customer company name is required." });

        CustomerDAL dal = new CustomerDAL();

        string? companyId = dal.GetManagerCompanyId(uid);
        if (companyId == null) return StatusCode(403, new { error = "User is not a registered manager." });

        string customerId = dal.CreateCustomer(companyId, customer);
        return Ok(new { message = "Customer created successfully.", customerId });
    }

    // GET /api/customers/{id}
    [HttpGet("{id}")]
    public async Task<IActionResult> GetCustomer(string id)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });

        CustomerDAL customerDal = new CustomerDAL();

        string? companyId = customerDal.GetManagerCompanyId(uid);
        if (companyId == null) return StatusCode(403, new { error = "User is not a registered manager." });

        Customer? customer = customerDal.GetCustomerById(id, companyId);
        if (customer == null) return NotFound(new { error = "Customer not found." });

        // Attach contacts from ContactPersonDAL
        ContactPersonDAL contactDal = new ContactPersonDAL();
        customer.Contacts = contactDal.GetContactsByCustomer(id, companyId);

        return Ok(customer);
    }

    // PUT /api/customers/{id}
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateCustomer(string id, [FromBody] Customer customer)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });

        if (string.IsNullOrWhiteSpace(customer.CustomerCompanyName))
            return BadRequest(new { error = "Customer company name is required." });

        CustomerDAL dal = new CustomerDAL();

        string? companyId = dal.GetManagerCompanyId(uid);
        if (companyId == null) return StatusCode(403, new { error = "User is not a registered manager." });

        dal.UpdateCustomer(id, companyId, customer);
        return Ok(new { message = "Customer updated successfully." });
    }

    // DELETE /api/customers/{id}
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteCustomer(string id)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });

        CustomerDAL dal = new CustomerDAL();

        string? companyId = dal.GetManagerCompanyId(uid);
        if (companyId == null) return StatusCode(403, new { error = "User is not a registered manager." });

        dal.DeleteCustomer(id, companyId);
        return Ok(new { message = "Customer deleted successfully." });
    }

    // GET /api/customers/{customerId}/contacts
    [HttpGet("{customerId}/contacts")]
    public async Task<IActionResult> GetContacts(string customerId)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });

        ContactPersonDAL dal = new ContactPersonDAL();

        string? companyId = dal.GetManagerCompanyId(uid);
        if (companyId == null) return StatusCode(403, new { error = "User is not a registered manager." });

        return Ok(dal.GetContactsByCustomer(customerId, companyId));
    }

    // POST /api/customers/{customerId}/contacts
    [HttpPost("{customerId}/contacts")]
    public async Task<IActionResult> CreateContact(string customerId, [FromBody] ContactPerson contact)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });

        if (string.IsNullOrWhiteSpace(contact.FirstName)) return BadRequest(new { error = "First name is required." });
        if (string.IsNullOrWhiteSpace(contact.LastName))  return BadRequest(new { error = "Last name is required." });

        ContactPersonDAL dal = new ContactPersonDAL();

        string? companyId = dal.GetManagerCompanyId(uid);
        if (companyId == null) return StatusCode(403, new { error = "User is not a registered manager." });

        string contactId = dal.CreateContact(customerId, companyId, contact);
        return Ok(new { message = "Contact person created successfully.", contactId });
    }

    // GET /api/customers/{customerId}/contacts/{contactId}
    [HttpGet("{customerId}/contacts/{contactId}")]
    public async Task<IActionResult> GetContact(string customerId, string contactId)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });

        ContactPersonDAL dal = new ContactPersonDAL();

        string? companyId = dal.GetManagerCompanyId(uid);
        if (companyId == null) return StatusCode(403, new { error = "User is not a registered manager." });

        ContactPerson? contact = dal.GetContactById(contactId, customerId, companyId);
        if (contact == null) return NotFound(new { error = "Contact not found." });

        return Ok(contact);
    }

    // PUT /api/customers/{customerId}/contacts/{contactId}
    [HttpPut("{customerId}/contacts/{contactId}")]
    public async Task<IActionResult> UpdateContact(string customerId, string contactId, [FromBody] ContactPerson contact)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });

        if (string.IsNullOrWhiteSpace(contact.FirstName)) return BadRequest(new { error = "First name is required." });
        if (string.IsNullOrWhiteSpace(contact.LastName))  return BadRequest(new { error = "Last name is required." });

        ContactPersonDAL dal = new ContactPersonDAL();

        string? companyId = dal.GetManagerCompanyId(uid);
        if (companyId == null) return StatusCode(403, new { error = "User is not a registered manager." });

        dal.UpdateContact(contactId, customerId, companyId, contact);
        return Ok(new { message = "Contact person updated successfully." });
    }

    // DELETE /api/customers/{customerId}/contacts/{contactId}
    [HttpDelete("{customerId}/contacts/{contactId}")]
    public async Task<IActionResult> DeleteContact(string customerId, string contactId)
    {
        string? uid = await GetFirebaseUidAsync();
        if (uid == null) return Unauthorized(new { error = "Valid Firebase token required." });

        ContactPersonDAL dal = new ContactPersonDAL();

        string? companyId = dal.GetManagerCompanyId(uid);
        if (companyId == null) return StatusCode(403, new { error = "User is not a registered manager." });

        dal.DeleteContact(contactId, customerId, companyId);
        return Ok(new { message = "Contact person deleted successfully." });
    }
}
