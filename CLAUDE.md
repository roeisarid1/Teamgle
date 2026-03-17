# Teamgle App — CLAUDE.md

Workforce management platform for managers to manage teams, projects, customers, and chats.

## Stack

- **Backend:** ASP.NET Core 8.0 + SQL Server (`Media.ruppin.ac.il`, DB: `igroup34_prod`)
- **Frontend:** Vanilla JS + HTML/CSS (no framework)
- **Auth:** Firebase Authentication (token verified server-side)
- **Storage:** Firebase Storage (client-side uploads/cleanup)
- **Realtime/Chat:** Firestore
- **Firebase Project:** `teamgle-9b1c5`

## How to Run

```bash
# Backend (from repo root)
cd backend/Teamgle.Api
dotnet run
# Listens on http://localhost:5000

# Frontend
# Open frontend/ with VS Code Live Server → http://127.0.0.1:5500
```

## Project Structure

```
Teamgle_App/
├── backend/Teamgle.Api/
│   ├── Controllers/        AuthController, EmployeesController, RolesController,
│   │                       CustomersController, ProjectsController
│   ├── Services/           AuthService, EmployeeService, CustomerService, ProjectService
│   ├── Repositories/       UserRepository, EmployeeRepository, CustomerRepository, ProjectRepository
│   ├── Models/             UserModel, DTOs/
│   ├── secrets/            firebase-service-account.json  ← gitignored
│   ├── Program.cs
│   └── appsettings.json    Firebase path, SQL connection, CORS origins
├── frontend/
│   ├── js/
│   │   ├── firebase-config.js       Firebase SDK init (auth, storage, db)
│   │   ├── auth.js                  Sign in / first registration / forgot password
│   │   ├── manager-dashboard.js     Main dashboard logic (employees, customers, projects)
│   │   ├── employee-dashboard.js    Employee view (chat only)
│   │   ├── chat-service.js          Firestore chat logic
│   │   └── chat-ui.js               Chat UI rendering
│   ├── css/
│   ├── auth.html
│   ├── manager-dashboard.html
│   └── employee-dashboard.html
├── logo/
│   └── Gemini_Generated_Image_x5zncpx5zncpx5zn.png   ← current logo file
└── .mcp.json                        MCP servers (mssql + firebase) ← gitignored
```

## API Endpoints

### Auth — `/api/auth`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/check-first-registration` | Validates email eligibility (FBUID=null check) |
| POST | `/complete-registration` | Saves Firebase UID to SQL after account creation |
| POST | `/verify-login` | Verifies Firebase ID token, returns user profile |

### Employees — `/api/employees`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List employees for manager's company |
| POST | `/create` | Create new employee |
| GET | `/{id}` | Get single employee with roles |
| PUT | `/{id}` | Update employee + roles |
| DELETE | `/{id}` | Delete employee (Storage cleanup done client-side first) |

### Roles — `/api/roles`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List global + company roles |
| POST | `/` | Create company role |

### Customers — `/api/customers`
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/` | List / create customers |
| GET/PUT/DELETE | `/{id}` | Single customer ops |
| GET/POST | `/{id}/contacts` | List / create contact persons |
| GET/PUT/DELETE | `/{id}/contacts/{cid}` | Single contact ops |

### Projects — `/api/projects`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Create project (with nested events + shifts) |

## Database Tables

```
[User]          user_ID, FBUID, email, firstName, lastName, DOB, phoneNum, company_ID
Manager         user_ID (FK User)
Employee        user_ID (FK User), cost_per_hour
Roll            Roll_ID, Roll_name
Roll_company    roll_ID, company_ID          ← scopes role to company
Employee_Roll   employee_user_ID, roll_ID    ← junction
Customer        customer_ID, customer_company_name, phone, email, city, address,
                billing_email, business_number, payment_terms, notes, company_ID
ContactPerson   contact_ID, customer_company_ID, first/last name, phone, email,
                job_title, is_primary, notes
Project         Proj_ID, name, start_date, end_date, status, customer_ID
Manager_Project manager_user_ID, project_ID, is_owner, joined_at
Event           event_ID, project_ID, name, location, start/end_time, attendees_count,
                event_type, planned_budget, expected_revenue, status
Shift           Shift_ID, event_ID, roll_ID, required_quantity, start/end_time
```

## Firestore Collections (Chat)

```
userProfiles/{uid}                   uid, firstName, lastName, email, companyId, role, lastSeen
conversations/{convDocId}            participants, participantInfo, lastMessage, unreadCounts
conversations/{convDocId}/messages/  messageId, senderUid, text, timestamp
```

Conversation doc ID format: `conv_general_{[uid1,uid2].sort().join('_x_')}` (deterministic, prevents duplicates)

## Key Design Patterns

1. **Company isolation** — every table has `company_ID`. Service resolves it from Firebase UID server-side. Frontend never trusted for company ID.
2. **Transactions** — create/update/delete across multiple tables always use SQL transactions.
3. **Parameterized queries** — all SQL uses `@parameters`, no string interpolation.
4. **Role replacement** — update employee deletes all `Employee_Roll` then re-inserts (atomic).
5. **Primary contact enforcement** — setting a contact as primary clears others (transactional).
6. **Firebase token on every request** — Bearer token extracted + verified via Firebase Admin SDK.
7. **Client-side file cleanup** — frontend cleans Firebase Storage before calling DELETE on employee/customer.
8. **Expandable table rows** — Employee/Customer tables toggle inline detail rows instead of separate pages.

## Auth Flow

```
First-time: manager adds email to DB → user calls check-first-registration
            → createUserWithEmailAndPassword (Firebase) → complete-registration (saves FBUID)

Login: signInWithEmailAndPassword → getIdToken → POST /verify-login
       → profile saved to sessionStorage → redirect to dashboard

Role redirect: profile.role === "Manager" → manager-dashboard.html
               profile.role === "Employee" → employee-dashboard.html
```

## CORS Allowed Origins

- `http://127.0.0.1:5500`
- `http://localhost:5500`
- `http://localhost:3000`

## Firebase Storage Paths

```
managers/{managerId}/employees/{employeeId}/profile    ← profile photo
managers/{managerId}/employees/{employeeId}/documents/ ← uploaded docs
```

## Important Files to Know

| File | Purpose |
|------|---------|
| `backend/Teamgle.Api/Program.cs` | DI registration, Firebase init, CORS setup |
| `backend/Teamgle.Api/appsettings.json` | Connection string, Firebase path, CORS |
| `backend/Teamgle.Api/secrets/firebase-service-account.json` | Firebase Admin credentials (gitignored) |
| `frontend/js/firebase-config.js` | Firebase client SDK init |
| `frontend/js/manager-dashboard.js` | Main frontend logic (~largest file) |
| `frontend/js/chat-service.js` | Firestore conversation/message logic |
| `.mcp.json` | MCP servers: mssql + firebase (gitignored) |
