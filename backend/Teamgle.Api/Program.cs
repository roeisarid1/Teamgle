using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using QuestPDF.Infrastructure;
using Teamgle.Api.Repositories;
using Teamgle.Api.Services;

QuestPDF.Settings.License = LicenseType.Community;

var builder = WebApplication.CreateBuilder(args);

// ── Firebase Admin SDK ─────────────────────────────────────────────────────
// The service account JSON path is read from appsettings (never hardcoded).
var serviceAccountPath = builder.Configuration["Firebase:ServiceAccountPath"]
    ?? throw new InvalidOperationException(
        "Firebase:ServiceAccountPath is not configured. " +
        "Set it in appsettings.Development.json pointing to your service account JSON file.");

var fullPath = Path.IsPathRooted(serviceAccountPath)
    ? serviceAccountPath
    : Path.Combine(Directory.GetCurrentDirectory(), serviceAccountPath);

if (!File.Exists(fullPath))
    throw new FileNotFoundException(
        $"Firebase service account file not found at: {fullPath}. " +
        "Place your firebase-service-account.json at backend/Teamgle.Api/secrets/");

FirebaseApp.Create(new AppOptions
{
    Credential = GoogleCredential.FromFile(fullPath)
});

// ── Services ───────────────────────────────────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

// Register repository and service with DI
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IEmployeeRepository, EmployeeRepository>();
builder.Services.AddScoped<IEmployeeService, EmployeeService>();
builder.Services.AddScoped<ICustomerRepository, CustomerRepository>();
builder.Services.AddScoped<ICustomerService, CustomerService>();
builder.Services.AddScoped<IProjectRepository, ProjectRepository>();
builder.Services.AddScoped<IProjectService, ProjectService>();
builder.Services.AddScoped<ITaskRepository, TaskRepository>();
builder.Services.AddScoped<ITaskService, TaskService>();
builder.Services.AddScoped<IInvoiceRepository, InvoiceRepository>();
builder.Services.AddScoped<IInvoiceService, InvoiceService>();
builder.Services.AddScoped<IGamificationRepository, GamificationRepository>();
builder.Services.AddScoped<IGamificationService, GamificationService>();

// ── CORS ───────────────────────────────────────────────────────────────────
// Allows the local frontend (e.g. Live Server) to call the API.
// In production, restrict this to your actual deployed frontend domain.
var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? [];

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// ── Build ──────────────────────────────────────────────────────────────────
var app = builder.Build();

app.UseCors("FrontendPolicy");
app.UseAuthorization();
app.MapControllers();

app.Run();
