using Microsoft.Data.SqlClient;
using Teamgle.Api.BL;

namespace Teamgle.Api.DAL;

// ContactPersonDAL - Data Access Layer for the ContactPerson table.
// Inherits BaseDAL for connection management.
// Uses stored procedures (sp_*) for all DB operations.
// Controller instantiates directly: new ContactPersonDAL()
public class ContactPersonDAL : BaseDAL
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

    // ── Contact Person CRUD ──────────────────────────────────────────────────

    public List<ContactPerson> GetContactsByCustomer(string customerId, string companyId)
    {
        SqlConnection con = null;
        SqlCommand cmd = null;
        SqlDataReader reader = null;
        var contacts = new List<ContactPerson>();

        try
        {
            con = OpenConnection();
            cmd = CreateStoredProcedureCommand(con, "sp_GetContactsByCustomer", new Dictionary<string, object>
            {
                { "@customerId", customerId },
                { "@companyId",  companyId  }
            });

            reader = cmd.ExecuteReader();
            while (reader.Read())
                contacts.Add(ReadContact(reader));

            return contacts;
        }
        finally
        {
            reader?.Close();
            cmd?.Dispose();
            con?.Close();
        }
    }

    public ContactPerson? GetContactById(string contactId, string customerId, string companyId)
    {
        SqlConnection con = null;
        SqlCommand cmd = null;
        SqlDataReader reader = null;

        try
        {
            con = OpenConnection();
            cmd = CreateStoredProcedureCommand(con, "sp_GetContactById", new Dictionary<string, object>
            {
                { "@contactId",  contactId  },
                { "@customerId", customerId },
                { "@companyId",  companyId  }
            });

            reader = cmd.ExecuteReader();
            if (!reader.Read()) return null;
            return ReadContact(reader);
        }
        finally
        {
            reader?.Close();
            cmd?.Dispose();
            con?.Close();
        }
    }

    // Creates a new contact person. Returns the new contact_ID.
    public string CreateContact(string customerId, string companyId, ContactPerson contact)
    {
        string contactId = Guid.NewGuid().ToString();
        SqlConnection con = null;
        SqlCommand cmd = null;

        try
        {
            con = OpenConnection();
            cmd = CreateStoredProcedureCommand(con, "sp_CreateContact", new Dictionary<string, object>
            {
                { "@contactId",  contactId                                             },
                { "@customerId", customerId                                            },
                { "@companyId",  companyId                                             },
                { "@firstName",  contact.FirstName!.Trim()                             },
                { "@lastName",   contact.LastName!.Trim()                              },
                { "@phone",      (object?)contact.Phone?.Trim()    ?? DBNull.Value },
                { "@email",      (object?)contact.Email?.Trim()    ?? DBNull.Value },
                { "@jobTitle",   (object?)contact.JobTitle?.Trim() ?? DBNull.Value },
                { "@isPrimary",  contact.IsPrimary                                     },
                { "@notes",      (object?)contact.Notes?.Trim()    ?? DBNull.Value },
                { "@createdAt",  DateTime.UtcNow                                       }
            });
            cmd.ExecuteNonQuery();
            return contactId;
        }
        finally
        {
            cmd?.Dispose();
            con?.Close();
        }
    }

    public void UpdateContact(string contactId, string customerId, string companyId, ContactPerson contact)
    {
        SqlConnection con = null;
        SqlCommand cmd = null;

        try
        {
            con = OpenConnection();
            cmd = CreateStoredProcedureCommand(con, "sp_UpdateContact", new Dictionary<string, object>
            {
                { "@contactId",  contactId                                             },
                { "@customerId", customerId                                            },
                { "@companyId",  companyId                                             },
                { "@firstName",  contact.FirstName!.Trim()                             },
                { "@lastName",   contact.LastName!.Trim()                              },
                { "@phone",      (object?)contact.Phone?.Trim()    ?? DBNull.Value },
                { "@email",      (object?)contact.Email?.Trim()    ?? DBNull.Value },
                { "@jobTitle",   (object?)contact.JobTitle?.Trim() ?? DBNull.Value },
                { "@isPrimary",  contact.IsPrimary                                     },
                { "@notes",      (object?)contact.Notes?.Trim()    ?? DBNull.Value }
            });
            cmd.ExecuteNonQuery();
        }
        finally
        {
            cmd?.Dispose();
            con?.Close();
        }
    }

    public void DeleteContact(string contactId, string customerId, string companyId)
    {
        SqlConnection con = null;
        SqlCommand cmd = null;

        try
        {
            con = OpenConnection();
            cmd = CreateStoredProcedureCommand(con, "sp_DeleteContact", new Dictionary<string, object>
            {
                { "@contactId",  contactId  },
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

    // ── Private helper ───────────────────────────────────────────────────────

    private static ContactPerson ReadContact(SqlDataReader reader)
    {
        return new ContactPerson
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
