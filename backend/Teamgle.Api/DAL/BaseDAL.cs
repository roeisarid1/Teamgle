using System.Data;
using Microsoft.Data.SqlClient;

namespace Teamgle.Api.DAL;

// BaseDAL - shared connection helper for all DAL classes.
// Reads the connection string directly from appsettings.json (same pattern as MealsProject).
// DAL classes inherit this and call OpenConnection() to get a ready SqlConnection.
public class BaseDAL
{
    protected string connectionString;

    public BaseDAL()
    {
        string env = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Development";
        IConfigurationRoot config = new ConfigurationBuilder()
            .AddJsonFile("appsettings.json", optional: false)
            .AddJsonFile($"appsettings.{env}.json", optional: true)
            .Build();

        connectionString = config.GetConnectionString("myProjDB")
            ?? throw new Exception("Connection string 'myProjDB' not found in appsettings.json");
    }

    // Returns a new open SqlConnection. Caller must dispose it.
    protected SqlConnection OpenConnection()
    {
        SqlConnection con = new SqlConnection(connectionString);
        con.Open();
        return con;
    }

    // Builds a stored-procedure SqlCommand with the given parameters.
    protected SqlCommand CreateStoredProcedureCommand(
        SqlConnection con,
        string spName,
        Dictionary<string, object>? parameters)
    {
        SqlCommand cmd = new SqlCommand(spName, con);
        cmd.CommandType = CommandType.StoredProcedure;

        if (parameters != null)
            foreach (var p in parameters)
                cmd.Parameters.AddWithValue(p.Key, p.Value);

        return cmd;
    }
}
