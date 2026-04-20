using Teamgle.Api.Models.DTOs;
using Teamgle.Api.Repositories;

namespace Teamgle.Api.Services;

public class CustomerService : ICustomerService
{
    private readonly ICustomerRepository _customerRepo;

    public CustomerService(ICustomerRepository customerRepo)
    {
        _customerRepo = customerRepo;
    }

    private async Task<string> ResolveCompanyIdAsync(string firebaseUid)
    {
        var companyId = await _customerRepo.GetManagerCompanyIdAsync(firebaseUid);
        if (companyId == null)
            throw new UnauthorizedAccessException("User is not a registered manager.");
        return companyId;
    }

    public async Task<List<CustomerResponse>> GetCustomersAsync(string firebaseUid)
    {
        var companyId = await ResolveCompanyIdAsync(firebaseUid);
        return await _customerRepo.GetCustomersByCompanyAsync(companyId);
    }

    public async Task<CustomerDetailResponse> GetCustomerByIdAsync(string firebaseUid, string customerId)
    {
        var companyId = await ResolveCompanyIdAsync(firebaseUid);
        var customer = await _customerRepo.GetCustomerByIdAsync(customerId, companyId);
        if (customer == null)
            throw new KeyNotFoundException("Customer not found.");
        return customer;
    }

    public async Task<string> CreateCustomerAsync(string firebaseUid, CreateCustomerRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.CustomerCompanyName))
            throw new ArgumentException("Customer company name is required.");
        var companyId = await ResolveCompanyIdAsync(firebaseUid);
        return await _customerRepo.CreateCustomerAsync(companyId, request);
    }

    public async Task UpdateCustomerAsync(string firebaseUid, string customerId, UpdateCustomerRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.CustomerCompanyName))
            throw new ArgumentException("Customer company name is required.");
        var companyId = await ResolveCompanyIdAsync(firebaseUid);
        await _customerRepo.UpdateCustomerAsync(customerId, companyId, request);
    }

    public async Task DeleteCustomerAsync(string firebaseUid, string customerId)
    {
        var companyId = await ResolveCompanyIdAsync(firebaseUid);
        await _customerRepo.DeleteCustomerAsync(customerId, companyId);
    }

    public async Task<List<ContactPersonResponse>> GetContactsAsync(string firebaseUid, string customerId)
    {
        var companyId = await ResolveCompanyIdAsync(firebaseUid);
        return await _customerRepo.GetContactsByCustomerAsync(customerId, companyId);
    }

    public async Task<ContactPersonResponse> GetContactByIdAsync(string firebaseUid, string customerId, string contactId)
    {
        var companyId = await ResolveCompanyIdAsync(firebaseUid);
        var contact = await _customerRepo.GetContactByIdAsync(contactId, customerId, companyId);
        if (contact == null)
            throw new KeyNotFoundException("Contact person not found.");
        return contact;
    }

    public async Task<string> CreateContactAsync(string firebaseUid, string customerId, CreateContactPersonRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.FirstName))
            throw new ArgumentException("First name is required.");
        if (string.IsNullOrWhiteSpace(request.LastName))
            throw new ArgumentException("Last name is required.");
        var companyId = await ResolveCompanyIdAsync(firebaseUid);
        return await _customerRepo.CreateContactAsync(customerId, companyId, request);
    }

    public async Task UpdateContactAsync(string firebaseUid, string customerId, string contactId, UpdateContactPersonRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.FirstName))
            throw new ArgumentException("First name is required.");
        if (string.IsNullOrWhiteSpace(request.LastName))
            throw new ArgumentException("Last name is required.");
        var companyId = await ResolveCompanyIdAsync(firebaseUid);
        await _customerRepo.UpdateContactAsync(contactId, customerId, companyId, request);
    }

    public async Task DeleteContactAsync(string firebaseUid, string customerId, string contactId)
    {
        var companyId = await ResolveCompanyIdAsync(firebaseUid);
        await _customerRepo.DeleteContactAsync(contactId, customerId, companyId);
    }
}
