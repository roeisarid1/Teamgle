using Teamgle.Api.Models.DTOs;
using Teamgle.Api.Repositories;

namespace Teamgle.Api.Services;

public class EmployeeService : IEmployeeService
{
    private readonly IEmployeeRepository _employeeRepo;

    public EmployeeService(IEmployeeRepository employeeRepo)
    {
        _employeeRepo = employeeRepo;
    }

    public async Task<List<RoleResponse>> GetRolesAsync(string firebaseUid)
    {
        var companyId = await _employeeRepo.GetManagerCompanyIdAsync(firebaseUid);
        if (companyId == null)
            throw new UnauthorizedAccessException("User is not a registered manager.");
        return await _employeeRepo.GetAllRolesAsync(companyId);
    }

    public async Task CreateRoleAsync(string firebaseUid, string roleName)
    {
        if (string.IsNullOrWhiteSpace(roleName))
            throw new ArgumentException("Role name is required.");

        var companyId = await _employeeRepo.GetManagerCompanyIdAsync(firebaseUid);
        if (companyId == null)
            throw new UnauthorizedAccessException("User is not a registered manager.");

        if (await _employeeRepo.RoleNameExistsForCompanyAsync(roleName.Trim(), companyId))
            throw new InvalidOperationException($"A role named '{roleName}' already exists.");

        await _employeeRepo.CreateRoleAsync(roleName, companyId);
    }

    public async Task<List<EmployeeResponse>> GetEmployeesForManagerAsync(string firebaseUid)
    {
        var companyId = await _employeeRepo.GetManagerCompanyIdAsync(firebaseUid);
        if (companyId == null)
            throw new UnauthorizedAccessException("User is not a registered manager.");
        return await _employeeRepo.GetEmployeesByCompanyAsync(companyId);
    }

    public async Task<EmployeeDetailResponse> GetEmployeeByIdAsync(string firebaseUid, string employeeId)
    {
        var companyId = await _employeeRepo.GetManagerCompanyIdAsync(firebaseUid);
        if (companyId == null)
            throw new UnauthorizedAccessException("User is not a registered manager.");

        var employee = await _employeeRepo.GetEmployeeByIdAsync(employeeId, companyId);
        if (employee == null)
            throw new KeyNotFoundException("Employee not found.");
        return employee;
    }

    public async Task<string> CreateEmployeeAsync(string firebaseUid, CreateEmployeeRequest request)
    {
        var companyId = await _employeeRepo.GetManagerCompanyIdAsync(firebaseUid);
        if (companyId == null)
            throw new UnauthorizedAccessException("User is not a registered manager.");

        if (string.IsNullOrWhiteSpace(request.FirstName))
            throw new ArgumentException("First name is required.");
        if (string.IsNullOrWhiteSpace(request.LastName))
            throw new ArgumentException("Last name is required.");
        if (string.IsNullOrWhiteSpace(request.Email))
            throw new ArgumentException("Email is required.");
        if (request.CostPerHour < 0)
            throw new ArgumentException("Cost per hour cannot be negative.");
        if (request.RoleIds == null || request.RoleIds.Count == 0)
            throw new ArgumentException("At least one role must be selected.");

        if (await _employeeRepo.EmailExistsAsync(request.Email.Trim().ToLower()))
            throw new InvalidOperationException("An employee with this email already exists.");

        if (!await _employeeRepo.RoleIdsExistAsync(request.RoleIds, companyId))
            throw new ArgumentException("One or more selected roles are invalid.");

        return await _employeeRepo.CreateEmployeeAsync(companyId, request);
    }

    public async Task UpdateEmployeeAsync(string firebaseUid, string employeeId, UpdateEmployeeRequest request)
    {
        var companyId = await _employeeRepo.GetManagerCompanyIdAsync(firebaseUid);
        if (companyId == null)
            throw new UnauthorizedAccessException("User is not a registered manager.");

        if (string.IsNullOrWhiteSpace(request.FirstName))
            throw new ArgumentException("First name is required.");
        if (string.IsNullOrWhiteSpace(request.LastName))
            throw new ArgumentException("Last name is required.");
        if (request.CostPerHour < 0)
            throw new ArgumentException("Cost per hour cannot be negative.");
        if (request.RoleIds == null || request.RoleIds.Count == 0)
            throw new ArgumentException("At least one role must be selected.");

        if (!await _employeeRepo.RoleIdsExistAsync(request.RoleIds, companyId))
            throw new ArgumentException("One or more selected roles are invalid.");

        await _employeeRepo.UpdateEmployeeAsync(employeeId, companyId, request);
    }

    public async Task DeleteEmployeeAsync(string firebaseUid, string employeeId)
    {
        var companyId = await _employeeRepo.GetManagerCompanyIdAsync(firebaseUid);
        if (companyId == null)
            throw new UnauthorizedAccessException("User is not a registered manager.");
        await _employeeRepo.DeleteEmployeeAsync(employeeId, companyId);
    }
}
