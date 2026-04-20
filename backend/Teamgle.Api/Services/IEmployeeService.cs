using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Services;

public interface IEmployeeService
{
    Task<List<RoleResponse>> GetRolesAsync(string firebaseUid);
    Task CreateRoleAsync(string firebaseUid, string roleName);
    Task<List<EmployeeResponse>> GetEmployeesForManagerAsync(string firebaseUid);
    Task<EmployeeDetailResponse> GetEmployeeByIdAsync(string firebaseUid, string employeeId);
    Task<string> CreateEmployeeAsync(string firebaseUid, CreateEmployeeRequest request);
    Task UpdateEmployeeAsync(string firebaseUid, string employeeId, UpdateEmployeeRequest request);
    Task DeleteEmployeeAsync(string firebaseUid, string employeeId);
}
