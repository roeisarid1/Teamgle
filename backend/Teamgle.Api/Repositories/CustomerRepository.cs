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

    // ── Get the company_ID for a manager by their Firebase UID ────────────
    public async Task<string?> GetManagerCompanyIdAsync(string firebaseUid)
    {
        const string sql = """
            SELECT u.company_ID
            FROM [User] u
            INNER JOIN Manager m ON u.user_ID = m.user_ID
            WHERE u.FBUID = @fbuid
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@fbuid", firebaseUid);

        await conn.OpenAsync();
        var result = await cmd.ExecuteScalarAsync();
        return result as string;
    }

    // ── Get all customers for a company ───────────────────────────────────
    public async Task<List<CustomerResponse>> GetCustomersByCompanyAsync(string companyId)
    {
        const string sql = """
            SELECT
                customer_ID,
                customer_company_name,
                company_phone,
                company_email,
                company_city,
                business_number,
                created_at
            FROM Customer
            WHERE company_ID = @companyId
            ORDER BY customer_company_name
            """;

        var customers = new List<CustomerResponse>();

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@companyId", companyId);

        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            customers.Add(new CustomerResponse
            {
                CustomerId           = reader["customer_ID"].ToString()!,
                CustomerCompanyName  = reader["customer_company_name"].ToString()!,
                CompanyPhone         = reader["company_phone"] == DBNull.Value ? null : reader["company_phone"].ToString(),
                CompanyEmail         = reader["company_email"] == DBNull.Value ? null : reader["company_email"].ToString(),
                CompanyCity          = reader["company_city"] == DBNull.Value ? null : reader["company_city"].ToString(),
                BusinessNumber       = reader["business_number"] == DBNull.Value ? null : reader["business_number"].ToString(),
                CreatedAt            = reader["created_at"] == DBNull.Value ? null : (DateTime?)reader["created_at"]
            });
        }

        return customers;
    }

    // ── Get a single customer with its contacts ────────────────────────────
    public async Task<CustomerDetailResponse?> GetCustomerByIdAsync(string customerId, string companyId)
    {
        const string customerSql = """
            SELECT
                customer_ID,
                customer_company_name,
                company_phone,
                company_email,
                company_city,
                company_address,
                billing_email,
                business_number,
                payment_terms,
                notes,
                created_at
            FROM Customer
            WHERE customer_ID = @customerId AND company_ID = @companyId
            """;

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        CustomerDetailResponse? customer = null;

        await using (var cmd = new SqlCommand(customerSql, conn))
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
                    CompanyPhone        = reader["company_phone"] == DBNull.Value ? null : reader["company_phone"].ToString(),
                    CompanyEmail        = reader["company_email"] == DBNull.Value ? null : reader["company_email"].ToString(),
                    CompanyCity         = reader["company_city"] == DBNull.Value ? null : reader["company_city"].ToString(),
                    CompanyAddress      = reader["company_address"] == DBNull.Value ? null : reader["company_address"].ToString(),
                    BillingEmail        = reader["billing_email"] == DBNull.Value ? null : reader["billing_email"].ToString(),
                    BusinessNumber      = reader["business_number"] == DBNull.Value ? null : reader["business_number"].ToString(),
                    PaymentTerms        = reader["payment_terms"] == DBNull.Value ? null : reader["payment_terms"].ToString(),
                    Notes               = reader["notes"] == DBNull.Value ? null : reader["notes"].ToString(),
                    CreatedAt           = reader["created_at"] == DBNull.Value ? null : (DateTime?)reader["created_at"],
                    Contacts            = []
                };
            }
        }

        if (customer == null) return null;

        const string contactSql = """
            SELECT
                contact_ID,
                customer_company_ID,
                first_name,
                last_name,
                phone,
                email,
                job_title,
                is_primary,
                notes,
                created_at
            FROM ContactPerson
            WHERE customer_company_ID = @customerId
            ORDER BY is_primary DESC, first_name, last_name
            """;

        await using (var cmd = new SqlCommand(contactSql, conn))
        {
            cmd.Parameters.AddWithValue("@customerId", customerId);
            await using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                customer.Contacts.Add(new ContactPersonResponse
                {
                    ContactId  = reader["contact_ID"].ToString()!,
                    CustomerId = reader["customer_company_ID"].ToString()!,
                    FirstName  = reader["first_name"].ToString()!,
                    LastName   = reader["last_name"].ToString()!,
                    Phone      = reader["phone"] == DBNull.Value ? null : reader["phone"].ToString(),
                    Email      = reader["email"] == DBNull.Value ? null : reader["email"].ToString(),
                    JobTitle   = reader["job_title"] == DBNull.Value ? null : reader["job_title"].ToString(),
                    IsPrimary  = reader["is_primary"] != DBNull.Value && (bool)reader["is_primary"],
                    Notes      = reader["notes"] == DBNull.Value ? null : reader["notes"].ToString(),
                    CreatedAt  = reader["created_at"] == DBNull.Value ? null : (DateTime?)reader["created_at"]
                });
            }
        }

        return customer;
    }

    // ── Create a new customer ──────────────────────────────────────────────
    public async Task<string> CreateCustomerAsync(string companyId, CreateCustomerRequest request)
    {
        var customerId = Guid.NewGuid().ToString();

        const string sql = """
            INSERT INTO Customer
                (customer_ID, customer_company_name, company_phone, company_email,
                 company_city, company_address, billing_email, business_number,
                 payment_terms, notes, created_at, company_ID)
            VALUES
                (@customerId, @name, @phone, @email,
                 @city, @address, @billingEmail, @businessNumber,
                 @paymentTerms, @notes, @createdAt, @companyId)
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand(sql, conn);

        cmd.Parameters.AddWithValue("@customerId",    customerId);
        cmd.Parameters.AddWithValue("@name",          request.CustomerCompanyName.Trim());
        cmd.Parameters.AddWithValue("@phone",         (object?)request.CompanyPhone?.Trim()   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@email",         (object?)request.CompanyEmail?.Trim()   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@city",          (object?)request.CompanyCity?.Trim()    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@address",       (object?)request.CompanyAddress?.Trim() ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@billingEmail",  (object?)request.BillingEmail?.Trim()   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@businessNumber",(object?)request.BusinessNumber?.Trim() ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@paymentTerms",  (object?)request.PaymentTerms?.Trim()   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@notes",         (object?)request.Notes?.Trim()          ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@createdAt",     DateTime.UtcNow);
        cmd.Parameters.AddWithValue("@companyId",     companyId);

        await conn.OpenAsync();
        await cmd.ExecuteNonQueryAsync();

        return customerId;
    }

    // ── Update an existing customer ────────────────────────────────────────
    public async Task UpdateCustomerAsync(string customerId, string companyId, UpdateCustomerRequest request)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        // Verify ownership
        const string checkSql = """
            SELECT COUNT(*)
            FROM Customer
            WHERE customer_ID = @customerId AND company_ID = @companyId
            """;

        await using (var checkCmd = new SqlCommand(checkSql, conn))
        {
            checkCmd.Parameters.AddWithValue("@customerId", customerId);
            checkCmd.Parameters.AddWithValue("@companyId",  companyId);
            if ((int)await checkCmd.ExecuteScalarAsync()! == 0)
                throw new UnauthorizedAccessException("Customer not found or access denied.");
        }

        const string sql = """
            UPDATE Customer
            SET customer_company_name = @name,
                company_phone         = @phone,
                company_email         = @email,
                company_city          = @city,
                company_address       = @address,
                billing_email         = @billingEmail,
                business_number       = @businessNumber,
                payment_terms         = @paymentTerms,
                notes                 = @notes
            WHERE customer_ID = @customerId AND company_ID = @companyId
            """;

        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@name",          request.CustomerCompanyName.Trim());
        cmd.Parameters.AddWithValue("@phone",         (object?)request.CompanyPhone?.Trim()   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@email",         (object?)request.CompanyEmail?.Trim()   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@city",          (object?)request.CompanyCity?.Trim()    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@address",       (object?)request.CompanyAddress?.Trim() ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@billingEmail",  (object?)request.BillingEmail?.Trim()   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@businessNumber",(object?)request.BusinessNumber?.Trim() ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@paymentTerms",  (object?)request.PaymentTerms?.Trim()   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@notes",         (object?)request.Notes?.Trim()          ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@customerId",    customerId);
        cmd.Parameters.AddWithValue("@companyId",     companyId);

        await cmd.ExecuteNonQueryAsync();
    }

    // ── Delete a customer and all its contacts (transactional) ────────────
    public async Task DeleteCustomerAsync(string customerId, string companyId)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        await using var tx = conn.BeginTransaction();

        try
        {
            // 1. Delete all contacts belonging to this customer
            await using (var cmd = new SqlCommand(
                "DELETE FROM ContactPerson WHERE customer_company_ID = @customerId", conn, tx))
            {
                cmd.Parameters.AddWithValue("@customerId", customerId);
                await cmd.ExecuteNonQueryAsync();
            }

            // 2. Delete the customer (company_ID guard = extra safety)
            await using (var cmd = new SqlCommand(
                "DELETE FROM Customer WHERE customer_ID = @customerId AND company_ID = @companyId", conn, tx))
            {
                cmd.Parameters.AddWithValue("@customerId", customerId);
                cmd.Parameters.AddWithValue("@companyId",  companyId);
                await cmd.ExecuteNonQueryAsync();
            }

            await tx.CommitAsync();
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    // ── Get all contacts for a customer (verifying company ownership) ──────
    public async Task<List<ContactPersonResponse>> GetContactsByCustomerAsync(string customerId, string companyId)
    {
        // Verify customer belongs to the company
        const string checkSql = """
            SELECT COUNT(*)
            FROM Customer
            WHERE customer_ID = @customerId AND company_ID = @companyId
            """;

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        await using (var checkCmd = new SqlCommand(checkSql, conn))
        {
            checkCmd.Parameters.AddWithValue("@customerId", customerId);
            checkCmd.Parameters.AddWithValue("@companyId",  companyId);
            if ((int)await checkCmd.ExecuteScalarAsync()! == 0)
                throw new KeyNotFoundException("Customer not found.");
        }

        const string sql = """
            SELECT
                contact_ID,
                customer_company_ID,
                first_name,
                last_name,
                phone,
                email,
                job_title,
                is_primary,
                notes,
                created_at
            FROM ContactPerson
            WHERE customer_company_ID = @customerId
            ORDER BY is_primary DESC, first_name, last_name
            """;

        var contacts = new List<ContactPersonResponse>();

        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@customerId", customerId);
        await using var reader = await cmd.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            contacts.Add(new ContactPersonResponse
            {
                ContactId  = reader["contact_ID"].ToString()!,
                CustomerId = reader["customer_company_ID"].ToString()!,
                FirstName  = reader["first_name"].ToString()!,
                LastName   = reader["last_name"].ToString()!,
                Phone      = reader["phone"] == DBNull.Value ? null : reader["phone"].ToString(),
                Email      = reader["email"] == DBNull.Value ? null : reader["email"].ToString(),
                JobTitle   = reader["job_title"] == DBNull.Value ? null : reader["job_title"].ToString(),
                IsPrimary  = reader["is_primary"] != DBNull.Value && (bool)reader["is_primary"],
                Notes      = reader["notes"] == DBNull.Value ? null : reader["notes"].ToString(),
                CreatedAt  = reader["created_at"] == DBNull.Value ? null : (DateTime?)reader["created_at"]
            });
        }

        return contacts;
    }

    // ── Get a single contact (verifying company ownership via JOIN) ────────
    public async Task<ContactPersonResponse?> GetContactByIdAsync(string contactId, string customerId, string companyId)
    {
        const string sql = """
            SELECT
                cp.contact_ID,
                cp.customer_company_ID,
                cp.first_name,
                cp.last_name,
                cp.phone,
                cp.email,
                cp.job_title,
                cp.is_primary,
                cp.notes,
                cp.created_at
            FROM ContactPerson cp
            INNER JOIN Customer c ON cp.customer_company_ID = c.customer_ID
            WHERE cp.contact_ID = @contactId
              AND cp.customer_company_ID = @customerId
              AND c.company_ID = @companyId
            """;

        await using var conn = new SqlConnection(_connectionString);
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@contactId",  contactId);
        cmd.Parameters.AddWithValue("@customerId", customerId);
        cmd.Parameters.AddWithValue("@companyId",  companyId);

        await conn.OpenAsync();
        await using var reader = await cmd.ExecuteReaderAsync();

        if (!await reader.ReadAsync()) return null;

        return new ContactPersonResponse
        {
            ContactId  = reader["contact_ID"].ToString()!,
            CustomerId = reader["customer_company_ID"].ToString()!,
            FirstName  = reader["first_name"].ToString()!,
            LastName   = reader["last_name"].ToString()!,
            Phone      = reader["phone"] == DBNull.Value ? null : reader["phone"].ToString(),
            Email      = reader["email"] == DBNull.Value ? null : reader["email"].ToString(),
            JobTitle   = reader["job_title"] == DBNull.Value ? null : reader["job_title"].ToString(),
            IsPrimary  = reader["is_primary"] != DBNull.Value && (bool)reader["is_primary"],
            Notes      = reader["notes"] == DBNull.Value ? null : reader["notes"].ToString(),
            CreatedAt  = reader["created_at"] == DBNull.Value ? null : (DateTime?)reader["created_at"]
        };
    }

    // ── Create a new contact person (transactional if isPrimary) ──────────
    public async Task<string> CreateContactAsync(string customerId, string companyId, CreateContactPersonRequest request)
    {
        var contactId = Guid.NewGuid().ToString();

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        await using var tx = conn.BeginTransaction();

        try
        {
            // Verify customer belongs to the company
            const string checkSql = """
                SELECT COUNT(*)
                FROM Customer
                WHERE customer_ID = @customerId AND company_ID = @companyId
                """;

            await using (var checkCmd = new SqlCommand(checkSql, conn, tx))
            {
                checkCmd.Parameters.AddWithValue("@customerId", customerId);
                checkCmd.Parameters.AddWithValue("@companyId",  companyId);
                if ((int)await checkCmd.ExecuteScalarAsync()! == 0)
                    throw new KeyNotFoundException("Customer not found.");
            }

            // If this contact is primary, clear existing primary flag
            if (request.IsPrimary)
            {
                await using var clearCmd = new SqlCommand(
                    "UPDATE ContactPerson SET is_primary = 0 WHERE customer_company_ID = @customerId", conn, tx);
                clearCmd.Parameters.AddWithValue("@customerId", customerId);
                await clearCmd.ExecuteNonQueryAsync();
            }

            const string insertSql = """
                INSERT INTO ContactPerson
                    (contact_ID, customer_company_ID, first_name, last_name,
                     phone, email, job_title, is_primary, notes, created_at)
                VALUES
                    (@contactId, @customerId, @firstName, @lastName,
                     @phone, @email, @jobTitle, @isPrimary, @notes, @createdAt)
                """;

            await using (var cmd = new SqlCommand(insertSql, conn, tx))
            {
                cmd.Parameters.AddWithValue("@contactId",  contactId);
                cmd.Parameters.AddWithValue("@customerId", customerId);
                cmd.Parameters.AddWithValue("@firstName",  request.FirstName.Trim());
                cmd.Parameters.AddWithValue("@lastName",   request.LastName.Trim());
                cmd.Parameters.AddWithValue("@phone",      (object?)request.Phone?.Trim()    ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@email",      (object?)request.Email?.Trim()    ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@jobTitle",   (object?)request.JobTitle?.Trim() ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@isPrimary",  request.IsPrimary);
                cmd.Parameters.AddWithValue("@notes",      (object?)request.Notes?.Trim()    ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@createdAt",  DateTime.UtcNow);
                await cmd.ExecuteNonQueryAsync();
            }

            await tx.CommitAsync();
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }

        return contactId;
    }

    // ── Update a contact person (transactional) ────────────────────────────
    public async Task UpdateContactAsync(string contactId, string customerId, string companyId, UpdateContactPersonRequest request)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();
        await using var tx = conn.BeginTransaction();

        try
        {
            // Verify ownership via JOIN with Customer
            const string checkSql = """
                SELECT COUNT(*)
                FROM ContactPerson cp
                INNER JOIN Customer c ON cp.customer_company_ID = c.customer_ID
                WHERE cp.contact_ID = @contactId
                  AND cp.customer_company_ID = @customerId
                  AND c.company_ID = @companyId
                """;

            await using (var checkCmd = new SqlCommand(checkSql, conn, tx))
            {
                checkCmd.Parameters.AddWithValue("@contactId",  contactId);
                checkCmd.Parameters.AddWithValue("@customerId", customerId);
                checkCmd.Parameters.AddWithValue("@companyId",  companyId);
                if ((int)await checkCmd.ExecuteScalarAsync()! == 0)
                    throw new UnauthorizedAccessException("Contact not found or access denied.");
            }

            // If updating to primary, clear existing primary flag for this customer
            if (request.IsPrimary)
            {
                await using var clearCmd = new SqlCommand(
                    "UPDATE ContactPerson SET is_primary = 0 WHERE customer_company_ID = @customerId", conn, tx);
                clearCmd.Parameters.AddWithValue("@customerId", customerId);
                await clearCmd.ExecuteNonQueryAsync();
            }

            const string updateSql = """
                UPDATE ContactPerson
                SET first_name = @firstName,
                    last_name  = @lastName,
                    phone      = @phone,
                    email      = @email,
                    job_title  = @jobTitle,
                    is_primary = @isPrimary,
                    notes      = @notes
                WHERE contact_ID = @contactId
                """;

            await using (var cmd = new SqlCommand(updateSql, conn, tx))
            {
                cmd.Parameters.AddWithValue("@firstName",  request.FirstName.Trim());
                cmd.Parameters.AddWithValue("@lastName",   request.LastName.Trim());
                cmd.Parameters.AddWithValue("@phone",      (object?)request.Phone?.Trim()    ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@email",      (object?)request.Email?.Trim()    ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@jobTitle",   (object?)request.JobTitle?.Trim() ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@isPrimary",  request.IsPrimary);
                cmd.Parameters.AddWithValue("@notes",      (object?)request.Notes?.Trim()    ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@contactId",  contactId);
                await cmd.ExecuteNonQueryAsync();
            }

            await tx.CommitAsync();
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    // ── Delete a contact person ────────────────────────────────────────────
    public async Task DeleteContactAsync(string contactId, string customerId, string companyId)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync();

        // Verify ownership via JOIN with Customer
        const string checkSql = """
            SELECT COUNT(*)
            FROM ContactPerson cp
            INNER JOIN Customer c ON cp.customer_company_ID = c.customer_ID
            WHERE cp.contact_ID = @contactId
              AND cp.customer_company_ID = @customerId
              AND c.company_ID = @companyId
            """;

        await using (var checkCmd = new SqlCommand(checkSql, conn))
        {
            checkCmd.Parameters.AddWithValue("@contactId",  contactId);
            checkCmd.Parameters.AddWithValue("@customerId", customerId);
            checkCmd.Parameters.AddWithValue("@companyId",  companyId);
            if ((int)await checkCmd.ExecuteScalarAsync()! == 0)
                throw new UnauthorizedAccessException("Contact not found or access denied.");
        }

        await using var cmd = new SqlCommand(
            "DELETE FROM ContactPerson WHERE contact_ID = @contactId", conn);
        cmd.Parameters.AddWithValue("@contactId", contactId);
        await cmd.ExecuteNonQueryAsync();
    }
}
