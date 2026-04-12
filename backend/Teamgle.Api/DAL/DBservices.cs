using System.Data;
using Microsoft.Data.SqlClient;

namespace Teamgle.Api.DAL;

// DBservices - opens database connections for the DAL layer.
// Reads the connection string from appsettings.json (key: myProjDB).
public class DBservices
{
    private readonly string _connectionString;

    // DI injects IConfiguration so we can read the connection string from appsettings.json.
    public DBservices(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("myProjDB")
            ?? throw new InvalidOperationException("Connection string 'myProjDB' not found in appsettings.");
    }

    // Returns a new SqlConnection (closed). Caller must open and dispose it.
    public SqlConnection Connect()
    {
        return new SqlConnection(_connectionString);
    }

    // Returns a SqlCommand already configured to call a stored procedure.
    // Saves every DAL method from repeating cmd.CommandType = StoredProcedure.
    public SqlCommand CreateCommand(string storedProcedure, SqlConnection conn)
    {
        SqlCommand cmd = new SqlCommand(storedProcedure, conn);
        cmd.CommandType = CommandType.StoredProcedure;
        return cmd;
    }
}
