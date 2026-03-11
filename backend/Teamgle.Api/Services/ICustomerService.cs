using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Services;

public interface ICustomerService
{
    // ── Customer operations ────────────────────────────────────────────────
    Task<List<CustomerResponse>> GetCustomersAsync(string firebaseUid);
    Task<CustomerDetailResponse> GetCustomerByIdAsync(string firebaseUid, string customerId);
    Task<string> CreateCustomerAsync(string firebaseUid, CreateCustomerRequest request);
    Task UpdateCustomerAsync(string firebaseUid, string customerId, UpdateCustomerRequest request);
    Task DeleteCustomerAsync(string firebaseUid, string customerId);

    // ── Contact Person operations ──────────────────────────────────────────
    Task<List<ContactPersonResponse>> GetContactsAsync(string firebaseUid, string customerId);
    Task<ContactPersonResponse> GetContactByIdAsync(string firebaseUid, string customerId, string contactId);
    Task<string> CreateContactAsync(string firebaseUid, string customerId, CreateContactPersonRequest request);
    Task UpdateContactAsync(string firebaseUid, string customerId, string contactId, UpdateContactPersonRequest request);
    Task DeleteContactAsync(string firebaseUid, string customerId, string contactId);
}
