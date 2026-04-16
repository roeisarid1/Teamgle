using Microsoft.Data.SqlClient;
using Teamgle.Api.BL;

namespace Teamgle.Api.DAL;

// EmployeeDAL - Data Access Layer for Employee, User, Role, and Employee_Roll tables.
// Inherits BaseDAL for connection management.
// Controller instantiates directly: new EmployeeDAL()
public class EmployeeDAL : BaseDAL
{
    // ── Manager / company ────────────────────────────────────────────────────

    public string? GetManagerCompanyId(string firebaseUid)
    {
        SqlConnection? con = null;
        SqlCommand? cmd = null;
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

    // ── Employees ────────────────────────────────────────────────────────────

    public List<Employee> GetEmployeesByCompany(string companyId)
    {
        SqlConnection? con = null;
        SqlCommand? cmd = null;
        SqlDataReader? reader = null;
        var employees = new Dictionary<string, Employee>();

        try
        {
            con = OpenConnection();

            cmd = new SqlCommand(
                """
                SELECT u.user_ID, u.firstName, u.lastName, u.email, u.phoneNum,
                       u.FBUID, e.cost_per_hour
                FROM [User] u
                INNER JOIN Employee e ON u.user_ID = e.user_ID
                WHERE u.company_ID = @companyId
                ORDER BY u.firstName, u.lastName
                """, con);
            cmd.Parameters.AddWithValue("@companyId", companyId);

            reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                string userId = reader["user_ID"].ToString()!;
                bool hasFbUid = reader["FBUID"] != DBNull.Value && !string.IsNullOrEmpty(reader["FBUID"].ToString());
                employees[userId] = new Employee
                {
                    UserId             = userId,
                    FirstName          = reader["firstName"]?.ToString() ?? "",
                    LastName           = reader["lastName"]?.ToString() ?? "",
                    Email              = reader["email"]?.ToString() ?? "",
                    PhoneNum           = reader["phoneNum"]?.ToString() ?? "",
                    CostPerHour        = reader["cost_per_hour"] == DBNull.Value ? null : (decimal?)reader["cost_per_hour"],
                    RegistrationStatus = hasFbUid ? "Active" : "Pending Registration",
                    Roles              = []
                };
            }
            reader.Close();
            cmd.Dispose();

            if (employees.Count == 0) return [];

            var paramNames = employees.Keys.Select((_, i) => $"@u{i}").ToList();
            cmd = new SqlCommand(
                $"""
                SELECT er.employee_user_ID, r.Roll_ID, r.Roll_name
                FROM Employee_Roll er
                INNER JOIN Roll r ON er.roll_ID = r.Roll_ID
                WHERE er.employee_user_ID IN ({string.Join(",", paramNames)})
                """, con);

            int idx = 0;
            foreach (var uid in employees.Keys)
                cmd.Parameters.AddWithValue($"@u{idx++}", uid);

            reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                string uid = reader["employee_user_ID"].ToString()!;
                if (employees.TryGetValue(uid, out var emp))
                    emp.Roles!.Add(new Role
                    {
                        RollId   = reader["Roll_ID"].ToString()!,
                        RollName = reader["Roll_name"].ToString()!
                    });
            }

            return [.. employees.Values];
        }
        finally
        {
            reader?.Close();
            cmd?.Dispose();
            con?.Close();
        }
    }

    public Employee? GetEmployeeById(string userId, string companyId)
    {
        SqlConnection? con = null;
        SqlCommand? cmd = null;
        SqlDataReader? reader = null;
        Employee? emp = null;

        try
        {
            con = OpenConnection();

            cmd = new SqlCommand(
                """
                SELECT u.user_ID, u.firstName, u.lastName, u.email, u.phoneNum,
                       u.FBUID, e.cost_per_hour
                FROM [User] u
                INNER JOIN Employee e ON u.user_ID = e.user_ID
                WHERE u.user_ID = @userId AND u.company_ID = @companyId
                """, con);
            cmd.Parameters.AddWithValue("@userId",    userId);
            cmd.Parameters.AddWithValue("@companyId", companyId);

            reader = cmd.ExecuteReader();
            if (reader.Read())
            {
                bool hasFbUid = reader["FBUID"] != DBNull.Value && !string.IsNullOrEmpty(reader["FBUID"].ToString());
                emp = new Employee
                {
                    UserId             = userId,
                    FirstName          = reader["firstName"]?.ToString() ?? "",
                    LastName           = reader["lastName"]?.ToString() ?? "",
                    Email              = reader["email"]?.ToString() ?? "",
                    PhoneNum           = reader["phoneNum"]?.ToString() ?? "",
                    CostPerHour        = reader["cost_per_hour"] == DBNull.Value ? null : (decimal?)reader["cost_per_hour"],
                    RegistrationStatus = hasFbUid ? "Active" : "Pending Registration",
                    Roles              = []
                };
            }
            reader.Close();
            cmd.Dispose();

            if (emp == null) return null;

            cmd = new SqlCommand(
                """
                SELECT r.Roll_ID, r.Roll_name
                FROM Employee_Roll er
                INNER JOIN Roll r ON er.roll_ID = r.Roll_ID
                WHERE er.employee_user_ID = @userId
                """, con);
            cmd.Parameters.AddWithValue("@userId", userId);

            reader = cmd.ExecuteReader();
            while (reader.Read())
                emp.Roles!.Add(new Role
                {
                    RollId   = reader["Roll_ID"].ToString()!,
                    RollName = reader["Roll_name"].ToString()!
                });

            return emp;
        }
        finally
        {
            reader?.Close();
            cmd?.Dispose();
            con?.Close();
        }
    }

    // Creates User + Employee + Employee_Roll in a transaction. Returns the new user_ID.
    public string CreateEmployee(string companyId, Employee emp)
    {
        string userId = Guid.NewGuid().ToString();
        SqlConnection? con = null;
        SqlTransaction? tx = null;
        SqlCommand? cmd = null;

        try
        {
            con = OpenConnection();
            tx = con.BeginTransaction();

            cmd = new SqlCommand(
                """
                INSERT INTO [User] (user_ID, FBUID, email, firstName, lastName, phoneNum, company_ID, created_at)
                VALUES (@userId, NULL, @email, @firstName, @lastName, @phoneNum, @companyId, @createdAt)
                """, con, tx);
            cmd.Parameters.AddWithValue("@userId",    userId);
            cmd.Parameters.AddWithValue("@email",     emp.Email!.Trim().ToLower());
            cmd.Parameters.AddWithValue("@firstName", emp.FirstName!.Trim());
            cmd.Parameters.AddWithValue("@lastName",  emp.LastName!.Trim());
            cmd.Parameters.AddWithValue("@phoneNum",  emp.PhoneNum!.Trim());
            cmd.Parameters.AddWithValue("@companyId", companyId);
            cmd.Parameters.AddWithValue("@createdAt", DateTime.UtcNow);
            cmd.ExecuteNonQuery();
            cmd.Dispose();

            cmd = new SqlCommand(
                "INSERT INTO Employee (user_ID, cost_per_hour, UID) VALUES (@userId, @cost, NULL)",
                con, tx);
            cmd.Parameters.AddWithValue("@userId", userId);
            cmd.Parameters.AddWithValue("@cost",   emp.CostPerHour);
            cmd.ExecuteNonQuery();
            cmd.Dispose();

            foreach (string roleId in emp.RoleIds!.Distinct())
            {
                cmd = new SqlCommand(
                    "INSERT INTO Employee_Roll (employee_user_ID, roll_ID) VALUES (@userId, @roleId)",
                    con, tx);
                cmd.Parameters.AddWithValue("@userId", userId);
                cmd.Parameters.AddWithValue("@roleId", roleId);
                cmd.ExecuteNonQuery();
                cmd.Dispose();
                cmd = null;
            }

            tx.Commit();
            return userId;
        }
        catch
        {
            tx?.Rollback();
            throw;
        }
        finally
        {
            cmd?.Dispose();
            con?.Close();
        }
    }

    // Updates User fields + cost + roles (transactional).
    public void UpdateEmployee(string userId, string companyId, Employee emp)
    {
        SqlConnection? con = null;
        SqlTransaction? tx = null;
        SqlCommand? cmd = null;

        try
        {
            con = OpenConnection();
            tx = con.BeginTransaction();

            cmd = new SqlCommand(
                """
                SELECT COUNT(*) FROM [User] u INNER JOIN Employee e ON u.user_ID = e.user_ID
                WHERE u.user_ID = @userId AND u.company_ID = @companyId
                """, con, tx);
            cmd.Parameters.AddWithValue("@userId",    userId);
            cmd.Parameters.AddWithValue("@companyId", companyId);
            if (Convert.ToInt32(cmd.ExecuteScalar()) == 0)
                throw new UnauthorizedAccessException("Employee not found or access denied.");
            cmd.Dispose();

            cmd = new SqlCommand(
                "UPDATE [User] SET firstName = @firstName, lastName = @lastName, phoneNum = @phoneNum WHERE user_ID = @userId",
                con, tx);
            cmd.Parameters.AddWithValue("@firstName", emp.FirstName!.Trim());
            cmd.Parameters.AddWithValue("@lastName",  emp.LastName!.Trim());
            cmd.Parameters.AddWithValue("@phoneNum",  (object?)emp.PhoneNum?.Trim() ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@userId",    userId);
            cmd.ExecuteNonQuery();
            cmd.Dispose();

            cmd = new SqlCommand("UPDATE Employee SET cost_per_hour = @cost WHERE user_ID = @userId", con, tx);
            cmd.Parameters.AddWithValue("@cost",   emp.CostPerHour);
            cmd.Parameters.AddWithValue("@userId", userId);
            cmd.ExecuteNonQuery();
            cmd.Dispose();

            cmd = new SqlCommand("DELETE FROM Employee_Roll WHERE employee_user_ID = @userId", con, tx);
            cmd.Parameters.AddWithValue("@userId", userId);
            cmd.ExecuteNonQuery();
            cmd.Dispose();

            foreach (string roleId in emp.RoleIds!.Distinct())
            {
                cmd = new SqlCommand(
                    "INSERT INTO Employee_Roll (employee_user_ID, roll_ID) VALUES (@userId, @roleId)",
                    con, tx);
                cmd.Parameters.AddWithValue("@userId", userId);
                cmd.Parameters.AddWithValue("@roleId", roleId);
                cmd.ExecuteNonQuery();
                cmd.Dispose();
                cmd = null;
            }

            tx.Commit();
        }
        catch
        {
            tx?.Rollback();
            throw;
        }
        finally
        {
            cmd?.Dispose();
            con?.Close();
        }
    }

    // Deletes Employee_Roll → Employee → User (transactional).
    public void DeleteEmployee(string userId, string companyId)
    {
        SqlConnection? con = null;
        SqlTransaction? tx = null;
        SqlCommand? cmd = null;

        try
        {
            con = OpenConnection();
            tx = con.BeginTransaction();

            cmd = new SqlCommand(
                """
                SELECT COUNT(*) FROM [User] u INNER JOIN Employee e ON u.user_ID = e.user_ID
                WHERE u.user_ID = @userId AND u.company_ID = @companyId
                """, con, tx);
            cmd.Parameters.AddWithValue("@userId",    userId);
            cmd.Parameters.AddWithValue("@companyId", companyId);
            if (Convert.ToInt32(cmd.ExecuteScalar()) == 0)
                throw new UnauthorizedAccessException("Employee not found or access denied.");
            cmd.Dispose();

            cmd = new SqlCommand("DELETE FROM Employee_Shift WHERE employee_user_ID = @userId", con, tx);
            cmd.Parameters.AddWithValue("@userId", userId);
            cmd.ExecuteNonQuery();
            cmd.Dispose();

            cmd = new SqlCommand("DELETE FROM Employee_Roll WHERE employee_user_ID = @userId", con, tx);
            cmd.Parameters.AddWithValue("@userId", userId);
            cmd.ExecuteNonQuery();
            cmd.Dispose();

            cmd = new SqlCommand("DELETE FROM Employee WHERE user_ID = @userId", con, tx);
            cmd.Parameters.AddWithValue("@userId", userId);
            cmd.ExecuteNonQuery();
            cmd.Dispose();

            cmd = new SqlCommand(
                "DELETE FROM [User] WHERE user_ID = @userId AND company_ID = @companyId",
                con, tx);
            cmd.Parameters.AddWithValue("@userId",    userId);
            cmd.Parameters.AddWithValue("@companyId", companyId);
            cmd.ExecuteNonQuery();

            tx.Commit();
        }
        catch
        {
            tx?.Rollback();
            throw;
        }
        finally
        {
            cmd?.Dispose();
            con?.Close();
        }
    }

    // ── Roles ────────────────────────────────────────────────────────────────

    public List<Role> GetAllRoles(string companyId)
    {
        SqlConnection? con = null;
        SqlCommand? cmd = null;
        SqlDataReader? reader = null;
        var roles = new List<Role>();

        try
        {
            con = OpenConnection();
            cmd = new SqlCommand(
                """
                SELECT r.Roll_ID, r.Roll_name
                FROM Roll r
                LEFT JOIN Roll_company rc ON r.Roll_ID = rc.roll_ID
                WHERE rc.company_ID IS NULL OR rc.company_ID = @companyId
                ORDER BY r.Roll_name
                """, con);
            cmd.Parameters.AddWithValue("@companyId", companyId);

            reader = cmd.ExecuteReader();
            while (reader.Read())
                roles.Add(new Role
                {
                    RollId   = reader["Roll_ID"].ToString()!,
                    RollName = reader["Roll_name"].ToString()!
                });

            return roles;
        }
        finally
        {
            reader?.Close();
            cmd?.Dispose();
            con?.Close();
        }
    }

    public bool RoleNameExistsForCompany(string roleName, string companyId)
    {
        SqlConnection? con = null;
        SqlCommand? cmd = null;

        try
        {
            con = OpenConnection();
            cmd = new SqlCommand(
                """
                SELECT COUNT(*) FROM Roll r
                LEFT JOIN Roll_company rc ON r.Roll_ID = rc.roll_ID
                WHERE LOWER(r.Roll_name) = LOWER(@name)
                  AND (rc.company_ID IS NULL OR rc.company_ID = @companyId)
                """, con);
            cmd.Parameters.AddWithValue("@name",      roleName);
            cmd.Parameters.AddWithValue("@companyId", companyId);
            return Convert.ToInt32(cmd.ExecuteScalar()) > 0;
        }
        finally
        {
            cmd?.Dispose();
            con?.Close();
        }
    }

    public void CreateRole(string roleName, string companyId)
    {
        string rollId = Guid.NewGuid().ToString();
        SqlConnection? con = null;
        SqlTransaction? tx = null;
        SqlCommand? cmd = null;

        try
        {
            con = OpenConnection();
            tx = con.BeginTransaction();

            cmd = new SqlCommand("INSERT INTO Roll (Roll_ID, Roll_name) VALUES (@id, @name)", con, tx);
            cmd.Parameters.AddWithValue("@id",   rollId);
            cmd.Parameters.AddWithValue("@name", roleName.Trim().ToLower());
            cmd.ExecuteNonQuery();
            cmd.Dispose();

            cmd = new SqlCommand(
                "INSERT INTO Roll_company (roll_ID, company_ID) VALUES (@rollId, @companyId)",
                con, tx);
            cmd.Parameters.AddWithValue("@rollId",    rollId);
            cmd.Parameters.AddWithValue("@companyId", companyId);
            cmd.ExecuteNonQuery();

            tx.Commit();
        }
        catch
        {
            tx?.Rollback();
            throw;
        }
        finally
        {
            cmd?.Dispose();
            con?.Close();
        }
    }

    public bool RoleIdsExist(List<string> roleIds, string companyId)
    {
        if (roleIds.Count == 0) return false;
        SqlConnection? con = null;
        SqlCommand? cmd = null;

        try
        {
            con = OpenConnection();
            var paramNames = roleIds.Select((_, i) => $"@r{i}").ToList();
            cmd = new SqlCommand(
                $"""
                SELECT COUNT(*) FROM Roll r
                LEFT JOIN Roll_company rc ON r.Roll_ID = rc.roll_ID
                WHERE r.Roll_ID IN ({string.Join(",", paramNames)})
                  AND (rc.company_ID IS NULL OR rc.company_ID = @companyId)
                """, con);

            for (int i = 0; i < roleIds.Count; i++)
                cmd.Parameters.AddWithValue($"@r{i}", roleIds[i]);
            cmd.Parameters.AddWithValue("@companyId", companyId);

            return Convert.ToInt32(cmd.ExecuteScalar()) == roleIds.Count;
        }
        finally
        {
            cmd?.Dispose();
            con?.Close();
        }
    }

    public bool EmailExists(string email)
    {
        SqlConnection? con = null;
        SqlCommand? cmd = null;

        try
        {
            con = OpenConnection();
            cmd = new SqlCommand(
                "SELECT COUNT(*) FROM [User] WHERE LOWER(email) = LOWER(@email)", con);
            cmd.Parameters.AddWithValue("@email", email);
            return Convert.ToInt32(cmd.ExecuteScalar()) > 0;
        }
        finally
        {
            cmd?.Dispose();
            con?.Close();
        }
    }
}
