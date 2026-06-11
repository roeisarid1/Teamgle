using Teamgle.Api.Models.DTOs;
using Teamgle.Api.Repositories;

namespace Teamgle.Api.Services;

public class InvoiceService : IInvoiceService
{
    private readonly IInvoiceRepository _repo;

    public InvoiceService(IInvoiceRepository repo)
    {
        _repo = repo;
    }

    private static readonly HashSet<string> ValidStatuses =
        ["draft", "sent", "partial", "paid", "overdue", "cancelled"];
    // Status is managed internally; not exposed to the user.

    private async Task EnsureManagerAsync(string firebaseUid)
    {
        var companyId = await _repo.GetManagerCompanyIdAsync(firebaseUid);
        if (companyId == null)
            throw new UnauthorizedAccessException("User is not a registered manager.");
    }

    public async Task<List<InvoiceResponse>> GetInvoicesAsync(string firebaseUid)
    {
        await EnsureManagerAsync(firebaseUid);
        return await _repo.GetInvoicesByCompanyAsync(firebaseUid);
    }

    public async Task<InvoiceResponse?> GetInvoiceByIdAsync(string invoiceId, string firebaseUid)
    {
        await EnsureManagerAsync(firebaseUid);
        return await _repo.GetInvoiceByIdAsync(invoiceId, firebaseUid);
    }

    public async Task<InvoiceResponse> CreateInvoiceAsync(CreateInvoiceRequest request, string firebaseUid)
    {
        if (string.IsNullOrWhiteSpace(request.InvoiceNumber))
            throw new ArgumentException("Invoice number is required.");
        if (request.InvoiceAmount <= 0)
            throw new ArgumentException("Invoice amount must be greater than zero.");
        if (request.DueDate < request.InvoiceDate)
            throw new ArgumentException("Due date cannot be before invoice date.");
        if (string.IsNullOrWhiteSpace(request.EventId) &&
            string.IsNullOrWhiteSpace(request.ProjectId) &&
            string.IsNullOrWhiteSpace(request.CustomerId))
            throw new ArgumentException("At least one of event, project, or customer must be specified.");

        await EnsureManagerAsync(firebaseUid);

        var result = await _repo.CreateInvoiceAsync(request, firebaseUid);
        return result ?? throw new InvalidOperationException("Invoice creation failed.");
    }

    public async Task<InvoiceResponse?> UpdateInvoiceAsync(string invoiceId, UpdateInvoiceRequest request, string firebaseUid)
    {
        if (string.IsNullOrWhiteSpace(request.InvoiceNumber))
            throw new ArgumentException("Invoice number is required.");
        if (request.InvoiceAmount <= 0)
            throw new ArgumentException("Invoice amount must be greater than zero.");
        if (request.DueDate < request.InvoiceDate)
            throw new ArgumentException("Due date cannot be before invoice date.");

        await EnsureManagerAsync(firebaseUid);
        return await _repo.UpdateInvoiceAsync(invoiceId, request, firebaseUid);
    }

    public async Task<InvoiceResponse?> RecordPaymentAsync(string invoiceId, RecordPaymentRequest request, string firebaseUid)
    {
        if (request.PaidAmount < 0)
            throw new ArgumentException("Paid amount cannot be negative.");
        if (request.PaymentStatus != null && !ValidStatuses.Contains(request.PaymentStatus))
            throw new ArgumentException($"Invalid payment status '{request.PaymentStatus}'.");

        await EnsureManagerAsync(firebaseUid);
        return await _repo.RecordPaymentAsync(invoiceId, request, firebaseUid);
    }

    public async Task<bool> DeleteInvoiceAsync(string invoiceId, string firebaseUid)
    {
        await EnsureManagerAsync(firebaseUid);
        return await _repo.DeleteInvoiceAsync(invoiceId, firebaseUid);
    }

    public async Task<List<InvoiceResponse>> GetInvoicesByProjectAsync(string projectId, string firebaseUid)
    {
        await EnsureManagerAsync(firebaseUid);
        return await _repo.GetInvoicesByProjectAsync(projectId, firebaseUid);
    }

    public async Task<List<InvoiceResponse>> GetInvoicesByEventAsync(string eventId, string firebaseUid)
    {
        await EnsureManagerAsync(firebaseUid);
        return await _repo.GetInvoicesByEventAsync(eventId, firebaseUid);
    }

    public async Task<List<InvoiceResponse>> GetInvoicesByCustomerAsync(string customerId, string firebaseUid)
    {
        await EnsureManagerAsync(firebaseUid);
        return await _repo.GetInvoicesByCustomerAsync(customerId, firebaseUid);
    }
}
