using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Services;

public interface IEmployeeService
{
    Task<List<RoleResponse>> GetRolesAsync(string firebaseUid);
    Task<List<EmployeeResponse>> GetEmployeesForManagerAsync(string firebaseUid);
    Task<string> CreateEmployeeAsync(string firebaseUid, CreateEmployeeRequest request);
    Task CreateRoleAsync(string firebaseUid, string roleName);

    // ── CRUD extensions ───────────────────────────────────────────────────
    Task<EmployeeDetailResponse> GetEmployeeByIdAsync(string firebaseUid, string employeeId);
    Task UpdateEmployeeAsync(string firebaseUid, string employeeId, UpdateEmployeeRequest request);
    Task DeleteEmployeeAsync(string firebaseUid, string employeeId);
}
