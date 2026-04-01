# Teamgle

A workforce management platform for managers to manage teams, projects, customers, and chats.

## Features

- **Employee Management** — Create, update, and delete employees with roles and profile photos
- **Customer Management** — Manage customers and their contact persons
- **Project Management** — Create projects with events, shifts, tasks, and briefs
- **Staffing & Assignments** — Manage worker assignments per project shift
- **Real-time Chat** — Firebase-powered messaging between managers and employees
- **Role-based Access** — Separate dashboards for managers and employees

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | ASP.NET Core 8.0 |
| Database | SQL Server |
| Frontend | Vanilla JS + HTML/CSS |
| Auth | Firebase Authentication |
| Storage | Firebase Storage |
| Realtime/Chat | Firestore |
| Firebase Project | `teamgle-9b1c5` |

## Getting Started

### Prerequisites

- .NET 8 SDK
- SQL Server access (`Media.ruppin.ac.il`, DB: `igroup34_prod`)
- Firebase service account key (place at `backend/Teamgle.Api/secrets/firebase-service-account.json`)
- VS Code with Live Server extension

### Run the Backend

```bash
cd backend/Teamgle.Api
dotnet run
# Listens on http://localhost:5000
```

### Run the Frontend

Open the `frontend/` folder with VS Code Live Server → `http://127.0.0.1:5500`

## Project Structure

```
Teamgle_App/
├── backend/Teamgle.Api/
│   ├── Controllers/        # AuthController, EmployeesController, RolesController,
│   │                       # CustomersController, ProjectsController
│   ├── Services/           # AuthService, EmployeeService, CustomerService, ProjectService
│   ├── Repositories/       # UserRepository, EmployeeRepository, CustomerRepository, ProjectRepository
│   ├── Models/             # UserModel, DTOs/
│   ├── secrets/            # firebase-service-account.json (gitignored)
│   ├── Program.cs
│   └── appsettings.json
├── frontend/
│   ├── js/
│   │   ├── firebase-config.js
│   │   ├── auth.js
│   │   ├── manager-dashboard.js
│   │   ├── employee-dashboard.js
│   │   ├── chat-service.js
│   │   └── chat-ui.js
│   ├── css/
│   ├── auth.html
│   ├── manager-dashboard.html
│   └── employee-dashboard.html
└── .mcp.json               # MCP servers (gitignored)
```

## API Overview

| Resource | Base Path |
|---|---|
| Auth | `/api/auth` |
| Employees | `/api/employees` |
| Roles | `/api/roles` |
| Customers | `/api/customers` |
| Projects | `/api/projects` |

## Auth Flow

1. Manager adds an employee email to the database
2. Employee calls `check-first-registration` to verify eligibility
3. Firebase account is created → `complete-registration` saves the UID
4. On login: Firebase token → `verify-login` → redirect based on role

## Key Design Principles

- **Company isolation** — every query is scoped to the authenticated manager's company
- **Parameterized SQL** — no string interpolation, no injection risk
- **Firebase token on every request** — Bearer token verified server-side via Firebase Admin SDK
- **Client-side file cleanup** — frontend deletes Firebase Storage files before calling backend DELETE
