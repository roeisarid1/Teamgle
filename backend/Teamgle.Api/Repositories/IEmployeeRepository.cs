using Teamgle.Api.Models.DTOs;

namespace Teamgle.Api.Repositories;

public interface IEmployeeRepository
{
    Task<List<RoleResponse>> GetAllRolesAsync();
    Task<bool> RoleIdsExistAsync(List<string> roleIds);
    Task<bool> EmailExistsAsync(string email);
    Task<string?> GetManagerCompanyIdAsync(string firebaseUid);
    Task<List<EmployeeResponse>> GetEmployeesByCompanyAsync(string companyId);
    Task CreateEmployeeAsync(string companyId, CreateEmployeeRequest request);
}
