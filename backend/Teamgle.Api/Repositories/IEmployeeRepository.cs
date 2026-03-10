using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Repositories;

public interface IEmployeeRepository
{
    Task<List<RoleResponse>> GetAllRolesAsync(string companyId);
    Task<bool> RoleIdsExistAsync(List<string> roleIds, string companyId);
    Task<bool> RoleNameExistsForCompanyAsync(string roleName, string companyId);
    Task CreateRoleAsync(string roleName, string companyId);
    Task<bool> EmailExistsAsync(string email);
    Task<string?> GetManagerCompanyIdAsync(string firebaseUid);
    Task<List<EmployeeResponse>> GetEmployeesByCompanyAsync(string companyId);
    Task<string> CreateEmployeeAsync(string companyId, CreateEmployeeRequest request);
}
