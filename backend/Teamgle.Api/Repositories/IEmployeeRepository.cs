using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Repositories;

public interface IEmployeeRepository
{
    Task<string?> GetManagerCompanyIdAsync(string firebaseUid);
    Task<List<RoleResponse>> GetAllRolesAsync(string companyId);
    Task<bool> RoleNameExistsForCompanyAsync(string roleName, string companyId);
    Task CreateRoleAsync(string roleName, string companyId);
    Task<bool> RoleIdsExistAsync(List<string> roleIds, string companyId);
    Task<bool> EmailExistsAsync(string email);
    Task<List<EmployeeResponse>> GetEmployeesByCompanyAsync(string companyId);
    Task<EmployeeDetailResponse?> GetEmployeeByIdAsync(string userId, string companyId);
    Task<string> CreateEmployeeAsync(string companyId, CreateEmployeeRequest request);
    Task UpdateEmployeeAsync(string userId, string companyId, UpdateEmployeeRequest request);
    Task DeleteEmployeeAsync(string userId, string companyId);
}
