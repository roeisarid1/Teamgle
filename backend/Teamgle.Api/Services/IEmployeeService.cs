using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Services;

public interface IEmployeeService
{
    Task<List<RoleResponse>> GetRolesAsync();
    Task<List<EmployeeResponse>> GetEmployeesForManagerAsync(string firebaseUid);
    Task CreateEmployeeAsync(string firebaseUid, CreateEmployeeRequest request);
}
