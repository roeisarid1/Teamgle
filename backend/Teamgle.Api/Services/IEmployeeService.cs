using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Services;

public interface IEmployeeService
{
    Task<List<RoleResponse>> GetRolesAsync(string firebaseUid);
    Task<List<EmployeeResponse>> GetEmployeesForManagerAsync(string firebaseUid);
    Task CreateEmployeeAsync(string firebaseUid, CreateEmployeeRequest request);
    Task CreateRoleAsync(string firebaseUid, string roleName);
}
