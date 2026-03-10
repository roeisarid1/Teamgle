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

    // ── Create a new company-specific role ────────────────────────────────
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

    // ── Get employees — only for the manager's company ────────────────────
    public async Task<List<EmployeeResponse>> GetEmployeesForManagerAsync(string firebaseUid)
    {
        var companyId = await _employeeRepo.GetManagerCompanyIdAsync(firebaseUid);

        if (companyId == null)
            throw new UnauthorizedAccessException("User is not a registered manager.");

        return await _employeeRepo.GetEmployeesByCompanyAsync(companyId);
    }

    // ── Create employee — validates then inserts transactionally ──────────
    public async Task<string> CreateEmployeeAsync(string firebaseUid, CreateEmployeeRequest request)
    {
        // 1. Resolve manager's company — never trust frontend
        var companyId = await _employeeRepo.GetManagerCompanyIdAsync(firebaseUid);
        if (companyId == null)
            throw new UnauthorizedAccessException("User is not a registered manager.");

        // 2. Validate required fields
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

        // 3. Check for duplicate email
        if (await _employeeRepo.EmailExistsAsync(request.Email.Trim().ToLower()))
            throw new InvalidOperationException("An employee with this email already exists.");

        // 4. Validate that all provided role IDs belong to this company (or are global)
        if (!await _employeeRepo.RoleIdsExistAsync(request.RoleIds, companyId))
            throw new ArgumentException("One or more selected roles are invalid.");

        // 5. Insert transactionally
        return await _employeeRepo.CreateEmployeeAsync(companyId, request);
    }
}
