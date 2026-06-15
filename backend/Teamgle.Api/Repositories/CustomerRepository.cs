using Microsoft.Data.SqlClient;
using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Repositories;

public class CustomerRepository : ICustomerRepository
{
    private readonly string _connectionString;

    public CustomerRepository(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("myProjDB")
            ?? throw new InvalidOperationException("ConnectionStrings:myProjDB is not set.");
    }

    // ── sp_GetManagerCompanyId ─────────────────────────────────────────────
    public async Task<string?> GetManagerCompanyIdAsync(string firebaseUid)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_GetManagerCompanyId", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@fbuid", firebaseUid);
        await conn.OpenAsync();
        var result = await cmd.ExecuteScalarAsync();
        return result as string;
    }

    // ── sp_GetCustomersByCompany ───────────────────────────────────────────
    public async Task<List<CustomerResponse>> GetCustomersByCompanyAsync(string companyId)
    {
        var customers = new List<CustomerResponse>();
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_GetCustomersByCompany", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@companyId", companyId);
        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            customers.Add(new CustomerResponse
            {
                CustomerId          = reader["customer_ID"].ToString()!,
                CustomerCompanyName = reader["customer_company_name"].ToString()!,
                CompanyPhone        = reader["company_phone"]  == DBNull.Value ? null : reader["company_phone"].ToString(),
                CompanyEmail        = reader["company_email"]  == DBNull.Value ? null : reader["company_email"].ToString(),
                CompanyCity         = reader["company_city"]   == DBNull.Value ? null : reader["company_city"].ToString(),
                BusinessNumber      = reader["business_number"] == DBNull.Value ? null : reader["business_number"].ToString(),
                CreatedAt           = reader["created_at"] == DBNull.Value ? null : (DateTime?)reader["created_at"]
            });
        }
        return customers;
    }

    // ── sp_GetCustomerById + sp_GetContactsByCustomer ─────────────────────
    public async Task<CustomerDetailResponse?> GetCustomerByIdAsync(string customerId, string companyId)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        CustomerDetailResponse? customer = null;

        await using (var cmd = new SqlCommand("sp_GetCustomerById", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        })
        {
            cmd.Parameters.AddWithValue("@customerId", customerId);
            cmd.Parameters.AddWithValue("@companyId",  companyId);
            await using var reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                customer = new CustomerDetailResponse
                {
                    CustomerId          = reader["customer_ID"].ToString()!,
                    CustomerCompanyName = reader["customer_company_name"].ToString()!,
                    CompanyPhone        = reader["company_phone"]    == DBNull.Value ? null : reader["company_phone"].ToString(),
                    CompanyEmail        = reader["company_email"]    == DBNull.Value ? null : reader["company_email"].ToString(),
                    CompanyCity         = reader["company_city"]     == DBNull.Value ? null : reader["company_city"].ToString(),
                    CompanyAddress      = reader["company_address"]  == DBNull.Value ? null : reader["company_address"].ToString(),
                    BillingEmail        = reader["billing_email"]    == DBNull.Value ? null : reader["billing_email"].ToString(),
                    BusinessNumber      = reader["business_number"]  == DBNull.Value ? null : reader["business_number"].ToString(),
                    PaymentTerms        = reader["payment_terms"]    == DBNull.Value ? null : reader["payment_terms"].ToString(),
                    Notes               = reader["notes"]            == DBNull.Value ? null : reader["notes"].ToString(),
                    CreatedAt           = reader["created_at"]       == DBNull.Value ? null : (DateTime?)reader["created_at"],
                    Contacts            = []
                };
            }
        }

        if (customer == null) return null;

        await using (var cmd = new SqlCommand("sp_GetContactsByCustomer", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        })
        {
            cmd.Parameters.AddWithValue("@customerId", customerId);
            cmd.Parameters.AddWithValue("@companyId",  companyId);
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
                customer.Contacts.Add(MapContact(reader));
        }

        return customer;
    }

    // ── sp_CreateCustomer ─────────────────────────────────────────────────
    public async Task<string> CreateCustomerAsync(string companyId, CreateCustomerRequest request)
    {
        var customerId = Guid.NewGuid().ToString();
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_CreateCustomer", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@customerId",     customerId);
        cmd.Parameters.AddWithValue("@name",           request.CustomerCompanyName.Trim());
        cmd.Parameters.AddWithValue("@phone",          (object?)request.CompanyPhone?.Trim()    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@email",          (object?)request.CompanyEmail?.Trim()    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@city",           (object?)request.CompanyCity?.Trim()     ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@address",        (object?)request.CompanyAddress?.Trim()  ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@billingEmail",   (object?)request.BillingEmail?.Trim()    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@businessNumber", (object?)request.BusinessNumber?.Trim()  ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@paymentTerms",   (object?)request.PaymentTerms?.Trim()    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@notes",          (object?)request.Notes?.Trim()           ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@createdAt",      DateTime.UtcNow);
        cmd.Parameters.AddWithValue("@companyId",      companyId);
        await conn.OpenAsync();
        await cmd.ExecuteNonQueryAsync();
        return customerId;
    }

    // ── sp_UpdateCustomer ─────────────────────────────────────────────────
    public async Task UpdateCustomerAsync(string customerId, string companyId, UpdateCustomerRequest request)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_UpdateCustomer", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@customerId",     customerId);
        cmd.Parameters.AddWithValue("@companyId",      companyId);
        cmd.Parameters.AddWithValue("@name",           request.CustomerCompanyName.Trim());
        cmd.Parameters.AddWithValue("@phone",          (object?)request.CompanyPhone?.Trim()    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@email",          (object?)request.CompanyEmail?.Trim()    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@city",           (object?)request.CompanyCity?.Trim()     ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@address",        (object?)request.CompanyAddress?.Trim()  ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@billingEmail",   (object?)request.BillingEmail?.Trim()    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@businessNumber", (object?)request.BusinessNumber?.Trim()  ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@paymentTerms",   (object?)request.PaymentTerms?.Trim()    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@notes",          (object?)request.Notes?.Trim()           ?? DBNull.Value);
        await conn.OpenAsync();
        try
        {
            await cmd.ExecuteNonQueryAsync();
        }
        catch (SqlException ex) when (ex.State == 2)
        {
            throw new UnauthorizedAccessException(ex.Message);
        }
    }

    // ── sp_DeleteCustomer ─────────────────────────────────────────────────
    public async Task DeleteCustomerAsync(string customerId, string companyId)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_DeleteCustomer", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@customerId", customerId);
        cmd.Parameters.AddWithValue("@companyId",  companyId);
        await conn.OpenAsync();
        try
        {
            await cmd.ExecuteNonQueryAsync();
        }
        catch (SqlException ex) when (ex.State == 3)
        {
            // Customer still has invoices — deletion is blocked by design.
            throw new InvalidOperationException(ex.Message);
        }
    }

    // ── sp_GetContactsByCustomer ──────────────────────────────────────────
    public async Task<List<ContactPersonResponse>> GetContactsByCustomerAsync(string customerId, string companyId)
    {
        var contacts = new List<ContactPersonResponse>();
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_GetContactsByCustomer", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@customerId", customerId);
        cmd.Parameters.AddWithValue("@companyId",  companyId);
        await conn.OpenAsync();
        try
        {
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
                contacts.Add(MapContact(reader));
        }
        catch (SqlException ex) when (ex.State == 1)
        {
            throw new KeyNotFoundException(ex.Message);
        }
        return contacts;
    }

    // ── sp_GetContactById ─────────────────────────────────────────────────
    public async Task<ContactPersonResponse?> GetContactByIdAsync(string contactId, string customerId, string companyId)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_GetContactById", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@contactId",  contactId);
        cmd.Parameters.AddWithValue("@customerId", customerId);
        cmd.Parameters.AddWithValue("@companyId",  companyId);
        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;
        return MapContact(reader);
    }

    // ── sp_CreateContact ──────────────────────────────────────────────────
    public async Task<string> CreateContactAsync(string customerId, string companyId, CreateContactPersonRequest request)
    {
        var contactId = Guid.NewGuid().ToString();
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_CreateContact", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@contactId",  contactId);
        cmd.Parameters.AddWithValue("@customerId", customerId);
        cmd.Parameters.AddWithValue("@companyId",  companyId);
        cmd.Parameters.AddWithValue("@firstName",  request.FirstName.Trim());
        cmd.Parameters.AddWithValue("@lastName",   request.LastName.Trim());
        cmd.Parameters.AddWithValue("@phone",      (object?)request.Phone?.Trim()    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@email",      (object?)request.Email?.Trim()    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@jobTitle",   (object?)request.JobTitle?.Trim() ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@isPrimary",  request.IsPrimary);
        cmd.Parameters.AddWithValue("@notes",      (object?)request.Notes?.Trim()    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@createdAt",  DateTime.UtcNow);
        await conn.OpenAsync();
        try
        {
            await cmd.ExecuteNonQueryAsync();
        }
        catch (SqlException ex) when (ex.State == 1)
        {
            throw new KeyNotFoundException(ex.Message);
        }
        catch (SqlException ex) when (ex.State == 3)
        {
            throw new InvalidOperationException(ex.Message);
        }
        return contactId;
    }

    // ── sp_UpdateContact ──────────────────────────────────────────────────
    public async Task UpdateContactAsync(string contactId, string customerId, string companyId, UpdateContactPersonRequest request)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_UpdateContact", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@contactId",  contactId);
        cmd.Parameters.AddWithValue("@customerId", customerId);
        cmd.Parameters.AddWithValue("@companyId",  companyId);
        cmd.Parameters.AddWithValue("@firstName",  request.FirstName.Trim());
        cmd.Parameters.AddWithValue("@lastName",   request.LastName.Trim());
        cmd.Parameters.AddWithValue("@phone",      (object?)request.Phone?.Trim()    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@email",      (object?)request.Email?.Trim()    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@jobTitle",   (object?)request.JobTitle?.Trim() ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@isPrimary",  request.IsPrimary);
        cmd.Parameters.AddWithValue("@notes",      (object?)request.Notes?.Trim()    ?? DBNull.Value);
        await conn.OpenAsync();
        try
        {
            await cmd.ExecuteNonQueryAsync();
        }
        catch (SqlException ex) when (ex.State == 2)
        {
            throw new UnauthorizedAccessException(ex.Message);
        }
    }

    // ── sp_DeleteContact ──────────────────────────────────────────────────
    public async Task DeleteContactAsync(string contactId, string customerId, string companyId)
    {
        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand("sp_DeleteContact", conn)
        {
            CommandType = System.Data.CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@contactId",  contactId);
        cmd.Parameters.AddWithValue("@customerId", customerId);
        cmd.Parameters.AddWithValue("@companyId",  companyId);
        await conn.OpenAsync();
        try
        {
            await cmd.ExecuteNonQueryAsync();
        }
        catch (SqlException ex) when (ex.State == 2)
        {
            throw new UnauthorizedAccessException(ex.Message);
        }
    }

    private static ContactPersonResponse MapContact(SqlDataReader reader) => new()
    {
        ContactId  = reader["contact_ID"].ToString()!,
        CustomerId = reader["customer_company_ID"].ToString()!,
        FirstName  = reader["first_name"].ToString()!,
        LastName   = reader["last_name"].ToString()!,
        Phone      = reader["phone"]      == DBNull.Value ? null : reader["phone"].ToString(),
        Email      = reader["email"]      == DBNull.Value ? null : reader["email"].ToString(),
        JobTitle   = reader["job_title"]  == DBNull.Value ? null : reader["job_title"].ToString(),
        IsPrimary  = reader["is_primary"] != DBNull.Value && (bool)reader["is_primary"],
        Notes      = reader["notes"]      == DBNull.Value ? null : reader["notes"].ToString(),
        CreatedAt  = reader["created_at"] == DBNull.Value ? null : (DateTime?)reader["created_at"]
    };
}
