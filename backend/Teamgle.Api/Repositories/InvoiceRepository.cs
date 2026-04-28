using System.Data;
using Microsoft.Data.SqlClient;
using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Repositories;

public class InvoiceRepository : IInvoiceRepository
{
    private readonly string _connectionString;

    public InvoiceRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("myProjDB")
            ?? throw new InvalidOperationException("ConnectionStrings:myProjDB is not set.");
    }

    // ── Map a reader row to InvoiceResponse ───────────────────────────────
    private static InvoiceResponse MapInvoice(SqlDataReader r) => new()
    {
        InvoiceId           = r["invoice_ID"].ToString()!,
        EventId             = r["event_ID"]   == DBNull.Value ? null : r["event_ID"].ToString(),
        ProjectId           = r["project_ID"] == DBNull.Value ? null : r["project_ID"].ToString(),
        CustomerId          = r["customer_ID"].ToString()!,
        InvoiceNumber       = r["invoice_number"].ToString()!,
        InvoiceDate         = r["invoice_date"] == DBNull.Value ? null : (DateTime?)Convert.ToDateTime(r["invoice_date"]),
        DueDate             = r["due_date"]     == DBNull.Value ? null : (DateTime?)Convert.ToDateTime(r["due_date"]),
        InvoiceAmount       = r["invoice_amount"] == DBNull.Value ? 0 : Convert.ToDecimal(r["invoice_amount"]),
        PaidAmount          = r["paid_amount"]    == DBNull.Value ? 0 : Convert.ToDecimal(r["paid_amount"]),
        PaymentStatus       = r["payment_status"].ToString()!,
        PaymentDate         = r["payment_date"] == DBNull.Value ? null : (DateTime?)Convert.ToDateTime(r["payment_date"]),
        CreatedAt           = r["created_at"]   == DBNull.Value ? null : (DateTime?)Convert.ToDateTime(r["created_at"]),
        Notes               = r["notes"]        == DBNull.Value ? null : r["notes"].ToString(),
        CustomerCompanyName = r["customer_company_name"] == DBNull.Value ? null : r["customer_company_name"].ToString(),
        ProjectName         = r["project_name"] == DBNull.Value ? null : r["project_name"].ToString(),
        EventName           = r["event_name"]   == DBNull.Value ? null : r["event_name"].ToString(),
    };

    // ── sp_GetManagerCompanyId ────────────────────────────────────────────
    public async Task<string?> GetManagerCompanyIdAsync(string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_GetManagerCompanyId", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@fbuid", firebaseUid);
        await conn.OpenAsync();
        var result = await cmd.ExecuteScalarAsync();
        return result as string;
    }

    // ── sp_GetInvoicesByManagerCompany ────────────────────────────────────
    public async Task<List<InvoiceResponse>> GetInvoicesByCompanyAsync(string firebaseUid)
    {
        var list = new List<InvoiceResponse>();
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_GetInvoicesByManagerCompany", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@managerFBUID", firebaseUid);
        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            list.Add(MapInvoice(reader));
        return list;
    }

    // ── sp_GetInvoiceById ────────────────────────────────────────────────
    public async Task<InvoiceResponse?> GetInvoiceByIdAsync(string invoiceId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_GetInvoiceById", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@invoiceId",    invoiceId);
        cmd.Parameters.AddWithValue("@managerFBUID", firebaseUid);
        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync()) return MapInvoice(reader);
        return null;
    }

    // ── sp_CreateInvoice ──────────────────────────────────────────────────
    public async Task<InvoiceResponse?> CreateInvoiceAsync(CreateInvoiceRequest request, string firebaseUid)
    {
        var newId = Guid.NewGuid().ToString();
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_CreateInvoice", conn)
            { CommandType = CommandType.StoredProcedure };

        cmd.Parameters.AddWithValue("@invoiceId",     newId);
        cmd.Parameters.AddWithValue("@managerFBUID",  firebaseUid);
        cmd.Parameters.AddWithValue("@eventId",       (object?)request.EventId    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@projectId",     (object?)request.ProjectId  ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@customerId",    (object?)request.CustomerId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@invoiceNumber", request.InvoiceNumber);
        cmd.Parameters.AddWithValue("@invoiceDate",   request.InvoiceDate);
        cmd.Parameters.AddWithValue("@dueDate",       request.DueDate);
        cmd.Parameters.AddWithValue("@invoiceAmount", request.InvoiceAmount);
        cmd.Parameters.AddWithValue("@paymentStatus", request.PaymentStatus);
        cmd.Parameters.AddWithValue("@notes",         (object?)request.Notes ?? DBNull.Value);

        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync()) return MapInvoice(reader);
        return null;
    }

    // ── sp_UpdateInvoice ──────────────────────────────────────────────────
    public async Task<InvoiceResponse?> UpdateInvoiceAsync(string invoiceId, UpdateInvoiceRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_UpdateInvoice", conn)
            { CommandType = CommandType.StoredProcedure };

        cmd.Parameters.AddWithValue("@invoiceId",     invoiceId);
        cmd.Parameters.AddWithValue("@managerFBUID",  firebaseUid);
        cmd.Parameters.AddWithValue("@invoiceNumber", request.InvoiceNumber);
        cmd.Parameters.AddWithValue("@invoiceDate",   request.InvoiceDate);
        cmd.Parameters.AddWithValue("@dueDate",       request.DueDate);
        cmd.Parameters.AddWithValue("@invoiceAmount", request.InvoiceAmount);
        cmd.Parameters.AddWithValue("@paymentStatus", request.PaymentStatus);
        cmd.Parameters.AddWithValue("@notes",         (object?)request.Notes ?? DBNull.Value);

        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync()) return MapInvoice(reader);
        return null;
    }

    // ── sp_RecordInvoicePayment ───────────────────────────────────────────
    public async Task<InvoiceResponse?> RecordPaymentAsync(string invoiceId, RecordPaymentRequest request, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_RecordInvoicePayment", conn)
            { CommandType = CommandType.StoredProcedure };

        cmd.Parameters.AddWithValue("@invoiceId",     invoiceId);
        cmd.Parameters.AddWithValue("@managerFBUID",  firebaseUid);
        cmd.Parameters.AddWithValue("@paidAmount",    request.PaidAmount);
        cmd.Parameters.AddWithValue("@paymentDate",   (object?)request.PaymentDate   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@paymentStatus", (object?)request.PaymentStatus ?? DBNull.Value);

        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync()) return MapInvoice(reader);
        return null;
    }

    // ── sp_DeleteInvoice (soft-cancel) ────────────────────────────────────
    public async Task<bool> DeleteInvoiceAsync(string invoiceId, string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_DeleteInvoice", conn)
            { CommandType = CommandType.StoredProcedure };

        cmd.Parameters.AddWithValue("@invoiceId",    invoiceId);
        cmd.Parameters.AddWithValue("@managerFBUID", firebaseUid);

        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
            return Convert.ToInt32(reader["affected"]) > 0;
        return false;
    }

    // ── sp_GetInvoicesByProject ───────────────────────────────────────────
    public async Task<List<InvoiceResponse>> GetInvoicesByProjectAsync(string projectId, string firebaseUid)
    {
        var list = new List<InvoiceResponse>();
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_GetInvoicesByProject", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@projectId",    projectId);
        cmd.Parameters.AddWithValue("@managerFBUID", firebaseUid);
        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            list.Add(MapInvoice(reader));
        return list;
    }

    // ── sp_GetInvoicesByEvent ─────────────────────────────────────────────
    public async Task<List<InvoiceResponse>> GetInvoicesByEventAsync(string eventId, string firebaseUid)
    {
        var list = new List<InvoiceResponse>();
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_GetInvoicesByEvent", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@eventId",      eventId);
        cmd.Parameters.AddWithValue("@managerFBUID", firebaseUid);
        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            list.Add(MapInvoice(reader));
        return list;
    }

    // ── sp_GetInvoicesByCustomer ──────────────────────────────────────────
    public async Task<List<InvoiceResponse>> GetInvoicesByCustomerAsync(string customerId, string firebaseUid)
    {
        var list = new List<InvoiceResponse>();
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd  = new SqlCommand("sp_GetInvoicesByCustomer", conn)
            { CommandType = CommandType.StoredProcedure };
        cmd.Parameters.AddWithValue("@customerId",   customerId);
        cmd.Parameters.AddWithValue("@managerFBUID", firebaseUid);
        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            list.Add(MapInvoice(reader));
        return list;
    }
}
