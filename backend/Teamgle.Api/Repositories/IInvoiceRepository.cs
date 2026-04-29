using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Repositories;

public interface IInvoiceRepository
{
    Task<string?> GetManagerCompanyIdAsync(string firebaseUid);
    Task<List<InvoiceResponse>> GetInvoicesByCompanyAsync(string firebaseUid);
    Task<InvoiceResponse?> GetInvoiceByIdAsync(string invoiceId, string firebaseUid);
    Task<InvoiceResponse?> CreateInvoiceAsync(CreateInvoiceRequest request, string firebaseUid);
    Task<InvoiceResponse?> UpdateInvoiceAsync(string invoiceId, UpdateInvoiceRequest request, string firebaseUid);
    Task<InvoiceResponse?> RecordPaymentAsync(string invoiceId, RecordPaymentRequest request, string firebaseUid);
    Task<bool> DeleteInvoiceAsync(string invoiceId, string firebaseUid);
    Task<List<InvoiceResponse>> GetInvoicesByProjectAsync(string projectId, string firebaseUid);
    Task<List<InvoiceResponse>> GetInvoicesByEventAsync(string eventId, string firebaseUid);
    Task<List<InvoiceResponse>> GetInvoicesByCustomerAsync(string customerId, string firebaseUid);
}
