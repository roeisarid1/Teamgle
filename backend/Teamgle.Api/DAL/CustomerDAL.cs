using Microsoft.Data.SqlClient;
using Teamgle.Api.BL;

namespace Teamgle.Api.DAL;

// CustomerDAL - Data Access Layer for the Customer table.
// Inherits BaseDAL for connection management.
// Uses stored procedures (sp_*) for all DB operations.
// Controller instantiates directly: new CustomerDAL()
public class CustomerDAL : BaseDAL
{
    // ── Manager / company ────────────────────────────────────────────────────

    public string? GetManagerCompanyId(string firebaseUid)
    {
        SqlConnection con = null;
        SqlCommand cmd = null;
        try
        {
            con = OpenConnection();
            cmd = new SqlCommand(
                "SELECT u.company_ID FROM [User] u INNER JOIN Manager m ON u.user_ID = m.user_ID WHERE u.FBUID = @fbuid",
                con);
            cmd.Parameters.AddWithValue("@fbuid", firebaseUid);
            return cmd.ExecuteScalar() as string;
        }
        finally
        {
            cmd?.Dispose();
            con?.Close();
        }
    }

    // ── Customer CRUD ────────────────────────────────────────────────────────

    public List<Customer> GetCustomersByCompany(string companyId)
    {
        SqlConnection con = null;
        SqlCommand cmd = null;
        SqlDataReader reader = null;
        var customers = new List<Customer>();

        try
        {
            con = OpenConnection();
            cmd = CreateStoredProcedureCommand(con, "sp_GetCustomersByCompany", new Dictionary<string, object>
            {
                { "@companyId", companyId }
            });

            reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                customers.Add(new Customer
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
        finally
        {
            reader?.Close();
            cmd?.Dispose();
            con?.Close();
        }
    }

    // Returns full customer detail without contacts (controller fetches those separately).
    public Customer? GetCustomerById(string customerId, string companyId)
    {
        SqlConnection con = null;
        SqlCommand cmd = null;
        SqlDataReader reader = null;

        try
        {
            con = OpenConnection();
            cmd = CreateStoredProcedureCommand(con, "sp_GetCustomerById", new Dictionary<string, object>
            {
                { "@customerId", customerId },
                { "@companyId",  companyId  }
            });

            reader = cmd.ExecuteReader();
            if (!reader.Read()) return null;

            return new Customer
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
                Contacts            = []
            };
        }
        finally
        {
            reader?.Close();
            cmd?.Dispose();
            con?.Close();
        }
    }

    // Creates a new customer. Returns the new customer_ID.
    public string CreateCustomer(string companyId, Customer customer)
    {
        string customerId = Guid.NewGuid().ToString();
        SqlConnection con = null;
        SqlCommand cmd = null;

        try
        {
            con = OpenConnection();
            cmd = CreateStoredProcedureCommand(con, "sp_CreateCustomer", new Dictionary<string, object>
            {
                { "@customerId",     customerId                                                     },
                { "@name",           customer.CustomerCompanyName!.Trim()                           },
                { "@phone",          (object?)customer.CompanyPhone?.Trim()   ?? DBNull.Value },
                { "@email",          (object?)customer.CompanyEmail?.Trim()   ?? DBNull.Value },
                { "@city",           (object?)customer.CompanyCity?.Trim()    ?? DBNull.Value },
                { "@address",        (object?)customer.CompanyAddress?.Trim() ?? DBNull.Value },
                { "@billingEmail",   (object?)customer.BillingEmail?.Trim()   ?? DBNull.Value },
                { "@businessNumber", (object?)customer.BusinessNumber?.Trim() ?? DBNull.Value },
                { "@paymentTerms",   (object?)customer.PaymentTerms?.Trim()   ?? DBNull.Value },
                { "@notes",          (object?)customer.Notes?.Trim()          ?? DBNull.Value },
                { "@createdAt",      DateTime.UtcNow                                          },
                { "@companyId",      companyId                                                }
            });
            cmd.ExecuteNonQuery();
            return customerId;
        }
        finally
        {
            cmd?.Dispose();
            con?.Close();
        }
    }

    public void UpdateCustomer(string customerId, string companyId, Customer customer)
    {
        SqlConnection con = null;
        SqlCommand cmd = null;

        try
        {
            con = OpenConnection();
            cmd = CreateStoredProcedureCommand(con, "sp_UpdateCustomer", new Dictionary<string, object>
            {
                { "@customerId",     customerId                                                     },
                { "@companyId",      companyId                                                      },
                { "@name",           customer.CustomerCompanyName!.Trim()                           },
                { "@phone",          (object?)customer.CompanyPhone?.Trim()   ?? DBNull.Value },
                { "@email",          (object?)customer.CompanyEmail?.Trim()   ?? DBNull.Value },
                { "@city",           (object?)customer.CompanyCity?.Trim()    ?? DBNull.Value },
                { "@address",        (object?)customer.CompanyAddress?.Trim() ?? DBNull.Value },
                { "@billingEmail",   (object?)customer.BillingEmail?.Trim()   ?? DBNull.Value },
                { "@businessNumber", (object?)customer.BusinessNumber?.Trim() ?? DBNull.Value },
                { "@paymentTerms",   (object?)customer.PaymentTerms?.Trim()   ?? DBNull.Value },
                { "@notes",          (object?)customer.Notes?.Trim()          ?? DBNull.Value }
            });
            cmd.ExecuteNonQuery();
        }
        finally
        {
            cmd?.Dispose();
            con?.Close();
        }
    }

    public void DeleteCustomer(string customerId, string companyId)
    {
        SqlConnection con = null;
        SqlCommand cmd = null;

        try
        {
            con = OpenConnection();
            cmd = CreateStoredProcedureCommand(con, "sp_DeleteCustomer", new Dictionary<string, object>
            {
                { "@customerId", customerId },
                { "@companyId",  companyId  }
            });
            cmd.ExecuteNonQuery();
        }
        finally
        {
            cmd?.Dispose();
            con?.Close();
        }
    }
}
