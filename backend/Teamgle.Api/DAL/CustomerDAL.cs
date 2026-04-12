using Microsoft.Data.SqlClient;
using Teamgle.Api.Models.DTOs;
using Teamgle.Api.Repositories;

namespace Teamgle.Api.DAL;

// CustomerDAL - Data Access Layer for the Customer and ContactPerson tables.
// Uses DBservices to open a connection, then calls Stored Procedures for all DB operations.
// Errors from RAISERROR in the SPs are translated into .NET exceptions the controller expects.
//
// Note: implements ICustomerRepository (defined in Repositories/) so the existing
// CustomerService and DI wiring don't need to change.
public class CustomerDAL : ICustomerRepository
{
    private readonly DBservices _db;

    public CustomerDAL(DBservices db)
    {
        _db = db;
    }

    // ── Error translation ─────────────────────────────────────────────────────
    // Each SP signals a specific error via RAISERROR with a state number.
    // We convert that state into the right .NET exception so the controller
    // can return the correct HTTP status code without knowing about SQL.
    //   state 1 → KeyNotFoundException          → 404 Not Found
    //   state 2 → UnauthorizedAccessException   → 403 Forbidden
    //   state 3 → InvalidOperationException     → 409 Conflict
    private static Exception ToAppException(SqlException ex)
    {
        if (ex.State == 1) return new KeyNotFoundException(ex.Message);
        if (ex.State == 2) return new UnauthorizedAccessException(ex.Message);
        if (ex.State == 3) return new InvalidOperationException(ex.Message);
        return ex; // unexpected SQL error → 500
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MANAGER / COMPANY
    // ─────────────────────────────────────────────────────────────────────────

    // Returns the company_ID for a manager by Firebase UID, or null if not a manager.
    public async Task<string?> GetManagerCompanyIdAsync(string firebaseUid)
    {
        await using SqlConnection conn = _db.Connect();
        await using SqlCommand cmd = _db.CreateCommand("sp_GetManagerCompanyId", conn);
        cmd.Parameters.AddWithValue("@fbuid", firebaseUid);

        await conn.OpenAsync();
        object? result = await cmd.ExecuteScalarAsync();
        return result as string;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CUSTOMER CRUD
    // ─────────────────────────────────────────────────────────────────────────

    // Returns summary list of all customers for the given company.
    public async Task<List<CustomerResponse>> GetCustomersByCompanyAsync(string companyId)
    {
        List<CustomerResponse> customers = new List<CustomerResponse>();

        await using SqlConnection conn = _db.Connect();
        await using SqlCommand cmd = _db.CreateCommand("sp_GetCustomersByCompany", conn);
        cmd.Parameters.AddWithValue("@companyId", companyId);

        await conn.OpenAsync();
        await using SqlDataReader reader = await cmd.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            customers.Add(new CustomerResponse
            {
                CustomerId          = reader["customer_ID"].ToString()!,
                CustomerCompanyName = reader["customer_company_name"].ToString()!,
                CompanyPhone        = reader["company_phone"]   == DBNull.Value ? null : reader["company_phone"].ToString(),
                CompanyEmail        = reader["company_email"]   == DBNull.Value ? null : reader["company_email"].ToString(),
                CompanyCity         = reader["company_city"]    == DBNull.Value ? null : reader["company_city"].ToString(),
                BusinessNumber      = reader["business_number"] == DBNull.Value ? null : reader["business_number"].ToString(),
                CreatedAt           = reader["created_at"]      == DBNull.Value ? null : (DateTime?)reader["created_at"]
            });
        }

        return customers;
    }

    // Returns full detail for one customer plus its contact persons.
    // Returns null if the customer doesn't exist or belongs to a different company.
    public async Task<CustomerDetailResponse?> GetCustomerByIdAsync(string customerId, string companyId)
    {
        await using SqlConnection conn = _db.Connect();
        await conn.OpenAsync();

        CustomerDetailResponse? customer = null;

        // Step 1: get the customer row
        await using (SqlCommand cmd = _db.CreateCommand("sp_GetCustomerById", conn))
        {
            cmd.Parameters.AddWithValue("@customerId", customerId);
            cmd.Parameters.AddWithValue("@companyId",  companyId);

            await using SqlDataReader reader = await cmd.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                customer = new CustomerDetailResponse
                {
                    CustomerId          = reader["customer_ID"].ToString()!,
                    CustomerCompanyName = reader["customer_company_name"].ToString()!,
                    CompanyPhone        = reader["company_phone"]   == DBNull.Value ? null : reader["company_phone"].ToString(),
                    CompanyEmail        = reader["company_email"]   == DBNull.Value ? null : reader["company_email"].ToString(),
                    CompanyCity         = reader["company_city"]    == DBNull.Value ? null : reader["company_city"].ToString(),
                    CompanyAddress      = reader["company_address"] == DBNull.Value ? null : reader["company_address"].ToString(),
                    BillingEmail        = reader["billing_email"]   == DBNull.Value ? null : reader["billing_email"].ToString(),
                    BusinessNumber      = reader["business_number"] == DBNull.Value ? null : reader["business_number"].ToString(),
                    PaymentTerms        = reader["payment_terms"]   == DBNull.Value ? null : reader["payment_terms"].ToString(),
                    Notes               = reader["notes"]           == DBNull.Value ? null : reader["notes"].ToString(),
                    CreatedAt           = reader["created_at"]      == DBNull.Value ? null : (DateTime?)reader["created_at"],
                    Contacts            = new List<ContactPersonResponse>()
                };
            }
        }

        if (customer == null) return null;

        // Step 2: get the contact persons for this customer
        await using (SqlCommand cmd = _db.CreateCommand("sp_GetContactsByCustomer", conn))
        {
            cmd.Parameters.AddWithValue("@customerId", customerId);
            cmd.Parameters.AddWithValue("@companyId",  companyId);

            await using SqlDataReader reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
                customer.Contacts.Add(ReadContact(reader));
        }

        return customer;
    }

    // Creates a new customer. Generates the GUID here and returns it to the caller.
    public async Task<string> CreateCustomerAsync(string companyId, CreateCustomerRequest request)
    {
        string customerId = Guid.NewGuid().ToString();

        await using SqlConnection conn = _db.Connect();
        await using SqlCommand cmd = _db.CreateCommand("sp_CreateCustomer", conn);

        cmd.Parameters.AddWithValue("@customerId",     customerId);
        cmd.Parameters.AddWithValue("@name",           request.CustomerCompanyName.Trim());
        cmd.Parameters.AddWithValue("@phone",          (object?)request.CompanyPhone?.Trim()   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@email",          (object?)request.CompanyEmail?.Trim()   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@city",           (object?)request.CompanyCity?.Trim()    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@address",        (object?)request.CompanyAddress?.Trim() ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@billingEmail",   (object?)request.BillingEmail?.Trim()   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@businessNumber", (object?)request.BusinessNumber?.Trim() ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@paymentTerms",   (object?)request.PaymentTerms?.Trim()   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@notes",          (object?)request.Notes?.Trim()          ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@createdAt",      DateTime.UtcNow);
        cmd.Parameters.AddWithValue("@companyId",      companyId);

        await conn.OpenAsync();
        await cmd.ExecuteNonQueryAsync();

        return customerId;
    }

    // Updates all editable fields of a customer.
    // The SP raises state=2 if the customer doesn't exist or belongs to another company.
    public async Task UpdateCustomerAsync(string customerId, string companyId, UpdateCustomerRequest request)
    {
        await using SqlConnection conn = _db.Connect();
        await using SqlCommand cmd = _db.CreateCommand("sp_UpdateCustomer", conn);

        cmd.Parameters.AddWithValue("@customerId",     customerId);
        cmd.Parameters.AddWithValue("@companyId",      companyId);
        cmd.Parameters.AddWithValue("@name",           request.CustomerCompanyName.Trim());
        cmd.Parameters.AddWithValue("@phone",          (object?)request.CompanyPhone?.Trim()   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@email",          (object?)request.CompanyEmail?.Trim()   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@city",           (object?)request.CompanyCity?.Trim()    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@address",        (object?)request.CompanyAddress?.Trim() ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@billingEmail",   (object?)request.BillingEmail?.Trim()   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@businessNumber", (object?)request.BusinessNumber?.Trim() ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@paymentTerms",   (object?)request.PaymentTerms?.Trim()   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@notes",          (object?)request.Notes?.Trim()          ?? DBNull.Value);

        await conn.OpenAsync();
        try
        {
            await cmd.ExecuteNonQueryAsync();
        }
        catch (SqlException ex) { throw ToAppException(ex); }
    }

    // Deletes a customer and all its contacts.
    // The SP handles the cascade delete in a transaction.
    public async Task DeleteCustomerAsync(string customerId, string companyId)
    {
        await using SqlConnection conn = _db.Connect();
        await using SqlCommand cmd = _db.CreateCommand("sp_DeleteCustomer", conn);
        cmd.Parameters.AddWithValue("@customerId", customerId);
        cmd.Parameters.AddWithValue("@companyId",  companyId);

        await conn.OpenAsync();
        await cmd.ExecuteNonQueryAsync();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONTACT PERSON CRUD
    // ─────────────────────────────────────────────────────────────────────────

    // Returns all contacts for a customer.
    // The SP raises state=1 if the customer doesn't exist or belongs to another company.
    public async Task<List<ContactPersonResponse>> GetContactsByCustomerAsync(string customerId, string companyId)
    {
        List<ContactPersonResponse> contacts = new List<ContactPersonResponse>();

        await using SqlConnection conn = _db.Connect();
        await using SqlCommand cmd = _db.CreateCommand("sp_GetContactsByCustomer", conn);
        cmd.Parameters.AddWithValue("@customerId", customerId);
        cmd.Parameters.AddWithValue("@companyId",  companyId);

        await conn.OpenAsync();
        try
        {
            await using SqlDataReader reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
                contacts.Add(ReadContact(reader));
        }
        catch (SqlException ex) { throw ToAppException(ex); }

        return contacts;
    }

    // Returns one contact person. Returns null if not found or wrong company.
    public async Task<ContactPersonResponse?> GetContactByIdAsync(string contactId, string customerId, string companyId)
    {
        await using SqlConnection conn = _db.Connect();
        await using SqlCommand cmd = _db.CreateCommand("sp_GetContactById", conn);
        cmd.Parameters.AddWithValue("@contactId",  contactId);
        cmd.Parameters.AddWithValue("@customerId", customerId);
        cmd.Parameters.AddWithValue("@companyId",  companyId);

        await conn.OpenAsync();
        await using SqlDataReader reader = await cmd.ExecuteReaderAsync();

        if (!await reader.ReadAsync()) return null;
        return ReadContact(reader);
    }

    // Creates a new contact person.
    // SP raises state=1 if customer not found, state=3 if a primary contact already exists.
    public async Task<string> CreateContactAsync(string customerId, string companyId, CreateContactPersonRequest request)
    {
        string contactId = Guid.NewGuid().ToString();

        await using SqlConnection conn = _db.Connect();
        await using SqlCommand cmd = _db.CreateCommand("sp_CreateContact", conn);

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
        catch (SqlException ex) { throw ToAppException(ex); }

        return contactId;
    }

    // Updates all fields of a contact person.
    // If IsPrimary=true the SP clears the flag on all other contacts first.
    // SP raises state=2 if the contact doesn't belong to this company.
    public async Task UpdateContactAsync(string contactId, string customerId, string companyId, UpdateContactPersonRequest request)
    {
        await using SqlConnection conn = _db.Connect();
        await using SqlCommand cmd = _db.CreateCommand("sp_UpdateContact", conn);

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
        catch (SqlException ex) { throw ToAppException(ex); }
    }

    // Deletes one contact person.
    // SP raises state=2 if the contact doesn't belong to this company.
    public async Task DeleteContactAsync(string contactId, string customerId, string companyId)
    {
        await using SqlConnection conn = _db.Connect();
        await using SqlCommand cmd = _db.CreateCommand("sp_DeleteContact", conn);
        cmd.Parameters.AddWithValue("@contactId",  contactId);
        cmd.Parameters.AddWithValue("@customerId", customerId);
        cmd.Parameters.AddWithValue("@companyId",  companyId);

        await conn.OpenAsync();
        try
        {
            await cmd.ExecuteNonQueryAsync();
        }
        catch (SqlException ex) { throw ToAppException(ex); }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIVATE HELPER
    // ─────────────────────────────────────────────────────────────────────────

    // Reads one row from a SqlDataReader and returns a ContactPersonResponse.
    // Used by every method that reads contact data.
    private static ContactPersonResponse ReadContact(SqlDataReader reader)
    {
        return new ContactPersonResponse
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
}
