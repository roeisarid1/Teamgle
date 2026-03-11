using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Repositories;

public interface ICustomerRepository
{
    Task<string?> GetManagerCompanyIdAsync(string firebaseUid);

    // ── Customer CRUD ──────────────────────────────────────────────────────
    Task<List<CustomerResponse>> GetCustomersByCompanyAsync(string companyId);
    Task<CustomerDetailResponse?> GetCustomerByIdAsync(string customerId, string companyId);
    Task<string> CreateCustomerAsync(string companyId, CreateCustomerRequest request);
    Task UpdateCustomerAsync(string customerId, string companyId, UpdateCustomerRequest request);
    Task DeleteCustomerAsync(string customerId, string companyId);

    // ── Contact Person CRUD ────────────────────────────────────────────────
    Task<List<ContactPersonResponse>> GetContactsByCustomerAsync(string customerId, string companyId);
    Task<ContactPersonResponse?> GetContactByIdAsync(string contactId, string customerId, string companyId);
    Task<string> CreateContactAsync(string customerId, string companyId, CreateContactPersonRequest request);
    Task UpdateContactAsync(string contactId, string customerId, string companyId, UpdateContactPersonRequest request);
    Task DeleteContactAsync(string contactId, string customerId, string companyId);
}
