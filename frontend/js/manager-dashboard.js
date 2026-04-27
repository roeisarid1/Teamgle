import { auth, storage } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  listAll,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { writeUserProfile } from "./chat-service.js";
import { initChat, destroyChat, openChatWith } from "./chat-ui.js";

const API_BASE = "http://localhost:5000/api";

// ── DOM ────────────────────────────────────────────────────────────────────
const navUsername = document.getElementById("nav-username");
const infoName = document.getElementById("info-name");
const infoRole = document.getElementById("info-role");
const infoCompany = document.getElementById("info-company");
const employeeTbody = document.getElementById("employee-tbody");
const rolesGrid = document.getElementById("roles-grid");
const modalOverlay = document.getElementById("modal-overlay");
const btnAddEmployee = document.getElementById("btn-add-employee");
const modalClose = document.getElementById("modal-close");
const modalCancel = document.getElementById("modal-cancel");
const btnSave = document.getElementById("btn-save-employee");
const formError = document.getElementById("form-error");
const formSuccess = document.getElementById("form-success");
const btnLogout = document.getElementById("btn-logout");
const btnHamburger = document.getElementById("btn-hamburger");
const btnSidebarReopen = document.getElementById("btn-sidebar-reopen");
const sidebar = document.querySelector(".sidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");

const MOBILE_BREAKPOINT = 768;

function setSidebarOpen(open) {
  sidebar.classList.toggle("collapsed", !open);
  btnSidebarReopen.classList.toggle("visible", !open);
  // Show backdrop only on mobile when sidebar is open
  if (sidebarBackdrop) {
    sidebarBackdrop.classList.toggle(
      "visible",
      open && window.innerWidth <= MOBILE_BREAKPOINT,
    );
  }
}

// Auto-collapse on mobile page load
if (window.innerWidth <= MOBILE_BREAKPOINT) {
  setSidebarOpen(false);
}

// Auto-collapse / auto-expand on resize
window.addEventListener("resize", () => {
  if (window.innerWidth <= MOBILE_BREAKPOINT) {
    setSidebarOpen(false);
  } else {
    setSidebarOpen(true);
    if (sidebarBackdrop) sidebarBackdrop.classList.remove("visible");
  }
});

btnHamburger.addEventListener("click", () => setSidebarOpen(false));
btnSidebarReopen.addEventListener("click", () => setSidebarOpen(true));
if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener("click", () => setSidebarOpen(false));
}

// Form inputs
const empFirstname = document.getElementById("emp-firstname");
const empLastname = document.getElementById("emp-lastname");
const empEmail = document.getElementById("emp-email");
const empPhone = document.getElementById("emp-phone");
const empCost = document.getElementById("emp-cost");

// File upload DOM refs
const profileFileInput = document.getElementById("profile-file-input");
const profilePreview = document.getElementById("profile-preview");
const profilePlaceholder = document.getElementById("profile-placeholder");
const btnRemoveProfile = document.getElementById("btn-remove-profile");
const documentsList = document.getElementById("documents-list");
const btnAddDoc = document.getElementById("btn-add-doc");

// ── State ──────────────────────────────────────────────────────────────────
let currentIdToken = null;
let currentFirebaseUid = null;
let profile = null;
let allEmployees = [];
let allCustomers = [];
let chatInitialized = false;
let _staffingPollInterval = null;
let _staffingClickController = null;

// Add mode
let profileFile = null; // File | null — new file chosen for profile
let documentFiles = []; // Array of { file, title } | null (nulled on remove)

// Edit mode
let editingEmployeeId = null; // null = add, string = edit
let existingProfilePath = null; // Firebase storage path of current profile image
let replaceProfile = false; // true when user removes existing profile in edit mode
let existingDocs = []; // [{ storagePath, url, name }] loaded from Firebase
let docsToDelete = new Set(); // storagePaths marked for removal in edit mode

// Delete modal
let pendingDeleteId = null;
let pendingDeleteName = null;

// ── Auth gate ──────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/frontend/auth.html";
    return;
  }

  currentIdToken = await user.getIdToken();
  currentFirebaseUid = user.uid;

  profile = JSON.parse(sessionStorage.getItem("userProfile") || "null");

  if (!profile || profile.role !== "Manager") {
    alert("Access denied. Manager accounts only.");
    await signOut(auth);
    window.location.href = "/frontend/auth.html";
    return;
  }

  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  navUsername.textContent = fullName;
  infoName.textContent = fullName;
  infoRole.textContent = profile.role;
  infoCompany.textContent = profile.companyId || "—";

  // Write Firestore user profile so this manager appears in other users' chat user list
  try {
    await writeUserProfile(user.uid, {
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email || "",
      companyId: profile.companyId,
      role: profile.role,
    });
  } catch (e) {
    console.warn("Chat profile write failed:", e);
  }

  await Promise.all([loadRoles(), loadEmployees()]);
  activateSection("projects");
});

// ── Token helper (auto-refresh) ────────────────────────────────────────────
async function getToken() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated.");
  return await user.getIdToken(false);
}

// ── Load roles ─────────────────────────────────────────────────────────────
async function loadRoles() {
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/roles`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to load roles.");
    const roles = await res.json();
    renderRoles(roles);
  } catch {
    rolesGrid.innerHTML =
      '<span style="color:#ef4444;font-size:13px">Failed to load roles.</span>';
  }
}

function renderRoles(roles) {
  if (!roles.length) {
    rolesGrid.innerHTML =
      '<span style="color:#6b7280;font-size:13px">No roles available.</span>';
    return;
  }
  rolesGrid.innerHTML = roles
    .map(
      (r) => `
    <label class="role-check">
      <input type="checkbox" value="${r.rollId}" />
      ${capitalize(r.rollName)}
    </label>
  `,
    )
    .join("");
}

// ── Search helpers ─────────────────────────────────────────────────────────
function filterEmployees(list) {
  const q          = (document.getElementById("employee-search")?.value ?? "").trim().toLowerCase();
  const salaryMax  = parseFloat(document.getElementById("emp-filter-salary-max")?.value ?? "");
  const statusVal  = (document.getElementById("emp-filter-status")?.value ?? "").toLowerCase();

  const hasFilter  = q || !isNaN(salaryMax) || statusVal;
  const clearBtn   = document.getElementById("emp-filter-clear");
  if (clearBtn) clearBtn.style.display = hasFilter ? "" : "none";

  return list.filter((e) => {
    if (q) {
      const full = `${e.firstName} ${e.lastName}`.toLowerCase();
      if (!full.includes(q) && !e.firstName.toLowerCase().includes(q) && !e.lastName.toLowerCase().includes(q)) return false;
    }
    if (!isNaN(salaryMax) && e.costPerHour != null && e.costPerHour > salaryMax) return false;
    if (statusVal) {
      const empStatus = (e.status ?? "active").toLowerCase();
      if (empStatus !== statusVal) return false;
    }
    return true;
  });
}

function filterCustomers(list) {
  const q = (document.getElementById("customer-search")?.value ?? "")
    .trim()
    .toLowerCase();
  if (!q) return list;
  return list.filter((c) =>
    (c.customerCompanyName ?? "").toLowerCase().startsWith(q),
  );
}

document.getElementById("employee-search")?.addEventListener("input", () => {
  renderEmployees(filterEmployees(allEmployees));
});
document.getElementById("emp-filter-salary-max")?.addEventListener("input", () => {
  renderEmployees(filterEmployees(allEmployees));
});
document.getElementById("emp-filter-status")?.addEventListener("change", () => {
  renderEmployees(filterEmployees(allEmployees));
});
document.getElementById("emp-filter-clear")?.addEventListener("click", () => {
  const s = document.getElementById("employee-search");
  const m = document.getElementById("emp-filter-salary-max");
  const st = document.getElementById("emp-filter-status");
  if (s) s.value = "";
  if (m) m.value = "";
  if (st) st.value = "";
  renderEmployees(filterEmployees(allEmployees));
});

document.getElementById("customer-search")?.addEventListener("input", () => {
  renderCustomers(filterCustomers(allCustomers));
});

// ── Load employees ─────────────────────────────────────────────────────────
async function loadEmployees() {
  employeeTbody.innerHTML = `<tr><td colspan="7" class="empty-state">Loading…</td></tr>`;
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/employees`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to load employees.");
    allEmployees = await res.json();
    renderEmployees(filterEmployees(allEmployees));
  } catch {
    employeeTbody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:#ef4444">Failed to load employees.</td></tr>`;
  }
}

function renderEmployees(employees) {
  if (!employees.length) {
    employeeTbody.innerHTML = `<tr><td colspan="7" class="empty-state">No employees yet. Click "+ Add Employee" to get started.</td></tr>`;
    return;
  }

  employeeTbody.innerHTML = employees
    .map(
      (e) => `
    <tr>
      <td><strong>${escape(e.firstName)} ${escape(e.lastName)}</strong></td>
      <td>${escape(e.email)}</td>
      <td>${escape(e.phoneNum || "—")}</td>
      <td>${e.costPerHour != null ? `₪${Number(e.costPerHour).toFixed(2)}` : "—"}</td>
      <td>
        <div class="roles-list">
          ${
            e.roles.length
              ? e.roles
                  .map(
                    (r) =>
                      `<span class="role-chip">${capitalize(escape(r.rollName || r))}</span>`,
                  )
                  .join("")
              : '<span style="color:#6b7280;font-size:12px">—</span>'
          }
        </div>
      </td>
      <td>
        <span class="badge ${e.registrationStatus === "Active" ? "badge-active" : "badge-pending"}">
          ${e.registrationStatus}
        </span>
      </td>
      <td>
        <div class="actions-cell">
          <button class="btn-chevron"
            data-action="toggle"
            data-id="${e.userId}"
            title="Toggle details">▾</button>
          <button class="btn-action btn-action-edit"
            data-action="edit"
            data-id="${e.userId}">Edit</button>
          <button class="btn-action btn-action-delete"
            data-action="delete"
            data-id="${e.userId}"
            data-name="${escape(e.firstName + " " + e.lastName)}">Delete</button>
        </div>
      </td>
    </tr>
  `,
    )
    .join("");
}

// ── Table action delegation ────────────────────────────────────────────────
employeeTbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === "toggle") {
    await toggleEmployeeRow(e.target.closest("tr"), id, btn);
  } else if (action === "edit") {
    await openEditModal(id);
  } else if (action === "delete") {
    openDeleteModal(id, btn.dataset.name);
  }
});

// ── View modal ─────────────────────────────────────────────────────────────
const viewModalOverlay = document.getElementById("view-modal-overlay");
document
  .getElementById("view-modal-close")
  .addEventListener("click", closeViewModal);
document
  .getElementById("view-modal-cancel")
  .addEventListener("click", closeViewModal);
viewModalOverlay.addEventListener("click", (e) => {
  if (e.target === viewModalOverlay) closeViewModal();
});

function closeViewModal() {
  viewModalOverlay.classList.remove("open");
}

async function openViewModal(employeeId) {
  const body = document.getElementById("view-modal-body");
  body.innerHTML = `<div class="empty-state">Loading…</div>`;
  viewModalOverlay.classList.add("open");

  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/employees/${employeeId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to load employee.");
    const emp = await res.json();

    // Load Firebase profile image
    let profileUrl = null;
    try {
      const profileDir = ref(storage, `employees/${employeeId}/profile`);
      const profileItems = await listAll(profileDir);
      if (profileItems.items.length > 0) {
        profileUrl = await getDownloadURL(profileItems.items[0]);
      }
    } catch {
      /* no profile image */
    }

    // Load Firebase documents
    let docs = [];
    try {
      const docsDir = ref(storage, `employees/${employeeId}/documents`);
      const docsItems = await listAll(docsDir);
      for (const item of docsItems.items) {
        const url = await getDownloadURL(item);
        docs.push({ name: item.name, url });
      }
    } catch {
      /* no documents */
    }

    const initials = (emp.firstName[0] + emp.lastName[0]).toUpperCase();
    const statusClass =
      emp.registrationStatus === "Active" ? "badge-active" : "badge-pending";

    const profileHtml = profileUrl
      ? `<img class="view-profile-img" src="${profileUrl}" alt="Profile" />`
      : `<div class="view-profile-initials">${initials}</div>`;

    const rolesHtml =
      emp.roles && emp.roles.length
        ? emp.roles
            .map(
              (r) =>
                `<span class="role-chip">${capitalize(escape(r.rollName || r))}</span>`,
            )
            .join("")
        : `<div class="empty-state-cta">
          <span class="empty-state-icon">🏷️</span>
          <p class="empty-state-title">No roles assigned</p>
          <p class="empty-state-hint">Assign roles to define this employee's responsibilities.</p>
          <button class="btn-empty-cta" data-edit-emp="${employeeId}">Edit Employee</button>
        </div>`;

    const docsHtml = docs.length
      ? `<div class="view-docs-list">${docs
          .map(
            (d) => `
          <div class="view-doc-item">
            <span class="view-doc-name" title="${escape(d.name)}">${escape(d.name)}</span>
            <a href="${d.url}" target="_blank" rel="noopener" class="btn-open-doc">Open</a>
          </div>`,
          )
          .join("")}
        </div>`
      : `<div class="empty-state-cta">
          <span class="empty-state-icon">📄</span>
          <p class="empty-state-title">No documents uploaded</p>
          <p class="empty-state-hint">Upload contracts, certificates or any relevant files for this employee.</p>
          <button class="btn-empty-cta" data-edit-emp="${employeeId}">Edit Employee</button>
        </div>`;

    body.innerHTML = `
      <div class="view-profile-section">
        ${profileHtml}
        <span class="view-profile-name">${escape(emp.firstName)} ${escape(emp.lastName)}</span>
        <span class="badge ${statusClass}">${escape(emp.registrationStatus)}</span>
      </div>
      <div class="view-info-grid">
        <div class="view-info-item">
          <label>Email</label>
          <span>${escape(emp.email)}</span>
        </div>
        <div class="view-info-item">
          <label>Phone</label>
          <span>${escape(emp.phoneNum || "—")}</span>
        </div>
        <div class="view-info-item">
          <label>Cost per Hour</label>
          <span>${emp.costPerHour != null ? `₪${Number(emp.costPerHour).toFixed(2)}` : "—"}</span>
        </div>
      </div>
      <div>
        <p class="view-section-title">Roles</p>
        <div class="roles-list">${rolesHtml}</div>
      </div>
      <div>
        <p class="view-section-title">Documents</p>
        ${docsHtml}
      </div>
    `;

    // Wire empty-state "Edit Employee" buttons
    body.querySelectorAll("[data-edit-emp]").forEach((btn) => {
      btn.addEventListener("click", () => {
        closeViewModal();
        openEditModal(btn.dataset.editEmp);
      });
    });
  } catch {
    body.innerHTML = `<div class="empty-state" style="color:#ef4444">Failed to load employee details.</div>`;
  }
}

// ── Employee expandable row ────────────────────────────────────────────────
async function toggleEmployeeRow(dataRow, employeeId, chevronBtn) {
  const isCurrentlyExpanded = chevronBtn.classList.contains("expanded");

  // Collapse any open employee expanded row
  document.querySelectorAll("#employee-tbody tr.expanded-row").forEach((r) => {
    r.previousElementSibling
      ?.querySelector(".btn-chevron")
      ?.classList.remove("expanded");
    r.remove();
  });

  if (isCurrentlyExpanded) return; // was open → now collapsed, done

  chevronBtn.classList.add("expanded");
  const expRow = document.createElement("tr");
  expRow.className = "expanded-row";
  expRow.innerHTML = `<td colspan="7"><div class="expanded-row-inner"><div class="empty-state">Loading…</div></div></td>`;
  dataRow.after(expRow);

  await renderEmployeeExpanded(
    expRow.querySelector(".expanded-row-inner"),
    employeeId,
  );
}

async function renderEmployeeExpanded(container, employeeId) {
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/employees/${employeeId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error();
    const emp = await res.json();

    let profileUrl = null;
    try {
      const profileDir = ref(storage, `employees/${employeeId}/profile`);
      const profileItems = await listAll(profileDir);
      if (profileItems.items.length > 0)
        profileUrl = await getDownloadURL(profileItems.items[0]);
    } catch {
      /* no profile image */
    }

    let docs = [];
    try {
      const docsDir = ref(storage, `employees/${employeeId}/documents`);
      const docsItems = await listAll(docsDir);
      for (const item of docsItems.items) {
        docs.push({ name: item.name, url: await getDownloadURL(item) });
      }
    } catch {
      /* no documents */
    }

    const initials = (emp.firstName[0] + emp.lastName[0]).toUpperCase();
    const statusClass =
      emp.registrationStatus === "Active" ? "badge-active" : "badge-pending";

    const profileHtml = profileUrl
      ? `<img class="view-profile-img" src="${profileUrl}" alt="Profile" />`
      : `<div class="view-profile-initials">${initials}</div>`;

    const rolesHtml =
      emp.roles && emp.roles.length
        ? `<div class="roles-list">${emp.roles.map((r) => `<span class="role-chip">${capitalize(escape(r.rollName || r))}</span>`).join("")}</div>`
        : `<span style="color:#6b7280;font-size:13px">No roles assigned.</span>`;

    const docsHtml = docs.length
      ? `<div class="view-docs-list">${docs
          .map(
            (d) => `
          <div class="view-doc-item">
            <span class="view-doc-name" title="${escape(d.name)}">${escape(d.name)}</span>
            <a href="${d.url}" target="_blank" rel="noopener" class="btn-open-doc">Open</a>
          </div>`,
          )
          .join("")}</div>`
      : `<span style="color:#6b7280;font-size:13px">No documents uploaded.</span>`;

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
        ${profileHtml}
        <div>
          <div style="font-size:16px;font-weight:700;color:var(--text)">${escape(emp.firstName)} ${escape(emp.lastName)}</div>
          <span class="badge ${statusClass}" style="margin-top:4px;display:inline-block">${escape(emp.registrationStatus)}</span>
        </div>
      </div>
      <div class="view-info-grid" style="margin-bottom:16px">
        ${viewField("Email", emp.email)}
        ${viewField("Phone", emp.phoneNum)}
        ${viewField("Cost per Hour", emp.costPerHour != null ? "₪" + Number(emp.costPerHour).toFixed(2) : null)}
      </div>
      <div style="margin-bottom:16px">
        <p class="view-section-title">Roles</p>
        ${rolesHtml}
      </div>
      <div>
        <p class="view-section-title">Documents</p>
        ${docsHtml}
      </div>
    `;

    // Wire empty-state edit buttons if any
    container.querySelectorAll("[data-edit-emp]").forEach((btn) => {
      btn.addEventListener("click", () => openEditModal(btn.dataset.editEmp));
    });
  } catch {
    container.innerHTML = `<div class="empty-state" style="color:#ef4444">Failed to load employee details.</div>`;
  }
}

// ── Modal open/close ───────────────────────────────────────────────────────
btnAddEmployee.addEventListener("click", () => openAddModal());
modalClose.addEventListener("click", closeModal);
modalCancel.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});

function openAddModal() {
  clearForm();
  // Retry loading roles if they failed on page init
  if (!rolesGrid.querySelector("input[type='checkbox']")) loadRoles();
  modalOverlay.classList.add("open");
}

async function openEditModal(employeeId) {
  clearForm();
  editingEmployeeId = employeeId;

  document.getElementById("modal-title").textContent = "Edit Employee";
  btnSave.innerHTML = `${_ICON.check} Save Changes`;
  delete btnSave.dataset.origHtml;
  empEmail.disabled = true;
  empEmail.style.opacity = "0.6";

  modalOverlay.classList.add("open");

  // Show loading state while fetching
  btnSave.disabled = true;
  btnSave.textContent = "Loading…";

  try {
    // 1. Load SQL data
    const token = await getToken();
    const res = await fetch(`${API_BASE}/employees/${employeeId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to load employee.");
    const emp = await res.json();

    // Pre-fill form fields
    empFirstname.value = emp.firstName;
    empLastname.value = emp.lastName;
    empEmail.value = emp.email;
    empPhone.value = emp.phoneNum || "";
    empCost.value = emp.costPerHour != null ? emp.costPerHour : "";

    // Check the employee's current roles
    const roleIds = emp.roles.map((r) => r.rollId);
    document
      .querySelectorAll("#roles-grid input[type='checkbox']")
      .forEach((cb) => {
        cb.checked = roleIds.includes(cb.value);
      });

    // 2. Load Firebase files
    await loadEmployeeFirebaseFiles(employeeId);
  } catch {
    showError("Failed to load employee details. Please try again.");
  } finally {
    btnSave.disabled = false;
    btnSave.innerHTML = `${_ICON.check} Save Changes`;
  }
}

async function loadEmployeeFirebaseFiles(employeeId) {
  // Load profile image
  try {
    const profileDir = ref(storage, `employees/${employeeId}/profile`);
    const profileItems = await listAll(profileDir);
    if (profileItems.items.length > 0) {
      const profileRef = profileItems.items[0];
      existingProfilePath = profileRef.fullPath;
      const url = await getDownloadURL(profileRef);
      profilePreview.src = url;
      profilePreview.style.display = "block";
      profilePlaceholder.style.display = "none";
      btnRemoveProfile.style.display = "inline-block";
    }
  } catch {
    // No profile image — that's fine
  }

  // Load documents
  try {
    const docsDir = ref(storage, `employees/${employeeId}/documents`);
    const docsItems = await listAll(docsDir);
    if (docsItems.items.length > 0) {
      documentsList.querySelector(".empty-state-cta")?.remove();
      document.getElementById("existing-docs-section").style.display = "block";
      const existingDocsList = document.getElementById("existing-docs-list");
      existingDocsList.innerHTML = "";

      for (const item of docsItems.items) {
        const url = await getDownloadURL(item);
        const docInfo = { storagePath: item.fullPath, url, name: item.name };
        existingDocs.push(docInfo);
        renderExistingDocItem(docInfo, existingDocsList);
      }
    }
  } catch {
    // No documents — that's fine
  }
}

function renderExistingDocItem(docInfo, container) {
  const item = document.createElement("div");
  item.className = "doc-item-existing";
  item.dataset.path = docInfo.storagePath;

  const safeName = escape(docInfo.name);
  item.innerHTML = `
    <span class="doc-item-name" title="${safeName}">${safeName}</span>
    <a href="${docInfo.url}" target="_blank" rel="noopener" class="btn-open-doc">Open</a>
    <button type="button" class="btn-remove-doc" title="Mark for removal">✕</button>
  `;

  const removeBtn = item.querySelector(".btn-remove-doc");
  removeBtn.addEventListener("click", () => {
    docsToDelete.add(docInfo.storagePath);
    item.classList.add("marked-delete");
    removeBtn.style.display = "none";

    // Undo button
    const undoBtn = document.createElement("button");
    undoBtn.type = "button";
    undoBtn.className = "btn-undo-doc";
    undoBtn.textContent = "Undo";
    undoBtn.addEventListener("click", () => {
      docsToDelete.delete(docInfo.storagePath);
      item.classList.remove("marked-delete");
      undoBtn.remove();
      removeBtn.style.display = "";
    });
    item.appendChild(undoBtn);
  });

  container.appendChild(item);
}

function closeModal() {
  modalOverlay.classList.remove("open");
  clearForm();
}

function clearForm() {
  // Reset field values
  empFirstname.value = "";
  empLastname.value = "";
  empEmail.value = "";
  empPhone.value = "";
  empCost.value = "";
  document
    .querySelectorAll("#roles-grid input[type='checkbox']")
    .forEach((cb) => (cb.checked = false));

  // Reset messages
  formError.style.display = "none";
  formSuccess.style.display = "none";

  // Reset profile image state
  profileFile = null;
  existingProfilePath = null;
  replaceProfile = false;
  profileFileInput.value = "";
  profilePreview.style.display = "none";
  profilePreview.src = "";
  profilePlaceholder.style.display = "flex";
  btnRemoveProfile.style.display = "none";

  // Reset documents state
  documentFiles = [];
  documentsList.innerHTML = `
    <div class="empty-state-cta" id="docs-empty-state">
      <span class="empty-state-icon">📄</span>
      <p class="empty-state-title">No documents added</p>
      <p class="empty-state-hint">Add contracts, certificates or any relevant files for this employee.</p>
      <button type="button" class="btn-empty-cta" id="btn-add-doc-empty">+ Add First Document</button>
    </div>`;
  documentsList
    .querySelector("#btn-add-doc-empty")
    .addEventListener("click", () => {
      if (editingEmployeeId)
        document.getElementById("new-docs-label").style.display = "block";
      addDocumentRow();
    });
  existingDocs = [];
  docsToDelete = new Set();
  document.getElementById("existing-docs-section").style.display = "none";
  document.getElementById("existing-docs-list").innerHTML = "";
  document.getElementById("new-docs-label").style.display = "none";

  // Reset edit mode
  editingEmployeeId = null;
  document.getElementById("modal-title").textContent = "Add New Employee";
  btnSave.innerHTML = `${_ICON.check} Save Employee`;
  delete btnSave.dataset.origHtml;
  btnSave.disabled = false;
  empEmail.disabled = false;
  empEmail.style.opacity = "";
}

// ── Save (handles both add and edit mode) ──────────────────────────────────
btnSave.addEventListener("click", async () => {
  formError.style.display = "none";
  formSuccess.style.display = "none";

  const firstName = empFirstname.value.trim();
  const lastName = empLastname.value.trim();
  const email = empEmail.value.trim().toLowerCase();
  const phoneNum = empPhone.value.trim();
  const costPerHour = parseFloat(empCost.value);
  const roleIds = [
    ...document.querySelectorAll("#roles-grid input:checked"),
  ].map((cb) => cb.value);

  // Client-side validation
  if (!firstName || !lastName) {
    showError("First and last name are required.");
    return;
  }
  if (!editingEmployeeId && (!email || !isValidEmail(email))) {
    showError("A valid email address is required.");
    return;
  }
  if (isNaN(costPerHour) || costPerHour < 0) {
    showError("Cost per hour must be a valid positive number.");
    return;
  }
  if (!roleIds.length) {
    showError("Please select at least one role.");
    return;
  }

  const incompleteDocs = documentFiles.filter(
    (d) => d && (d.file || d.title) && !(d.file && d.title),
  );
  if (incompleteDocs.length > 0) {
    showError(
      "Please select a title and a file for every document row, or remove incomplete rows.",
    );
    return;
  }

  if (editingEmployeeId) {
    await handleSaveEdit(firstName, lastName, phoneNum, costPerHour, roleIds);
  } else {
    await handleSaveAdd(
      firstName,
      lastName,
      email,
      phoneNum,
      costPerHour,
      roleIds,
    );
  }
});

// ── Add employee ───────────────────────────────────────────────────────────
async function handleSaveAdd(
  firstName,
  lastName,
  email,
  phoneNum,
  costPerHour,
  roleIds,
) {
  setLoading(btnSave, true);

  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/employees/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        phoneNum,
        costPerHour,
        roleIds,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      showError(data.error || "Failed to create employee.");
      return;
    }

    const { employeeId } = data;
    const uploadErrors = [];

    if (profileFile) {
      btnSave.textContent = "Uploading image…";
      try {
        await uploadProfileImage(employeeId, profileFile);
      } catch {
        uploadErrors.push("Profile image upload failed.");
      }
    }

    const validDocs = documentFiles.filter((d) => d && d.file && d.title);
    if (validDocs.length > 0) {
      btnSave.textContent = "Uploading documents…";
      try {
        await uploadDocuments(employeeId, validDocs);
      } catch {
        uploadErrors.push("Some documents failed to upload.");
      }
    }

    formSuccess.textContent =
      uploadErrors.length > 0
        ? `${firstName} ${lastName} added. Note: ${uploadErrors.join(" ")}`
        : `${firstName} ${lastName} was added successfully.`;
    formSuccess.style.display = "block";

    await loadEmployees();
    setTimeout(closeModal, 1800);
  } catch {
    showError("Network error. Please check your connection.");
  } finally {
    setLoading(btnSave, false);
  }
}

// ── Update employee ────────────────────────────────────────────────────────
async function handleSaveEdit(
  firstName,
  lastName,
  phoneNum,
  costPerHour,
  roleIds,
) {
  setLoading(btnSave, true);

  const uploadErrors = [];

  try {
    const token = await getToken();

    // ── Firebase: handle profile image changes ─────────────────────────
    // Delete old profile if: it exists AND user removed it OR picked a new one
    if (existingProfilePath && (replaceProfile || profileFile)) {
      try {
        await deleteObject(ref(storage, existingProfilePath));
      } catch {
        /* ignore — file may already be gone */
      }
    }

    if (profileFile) {
      btnSave.textContent = "Uploading image…";
      try {
        await uploadProfileImage(editingEmployeeId, profileFile);
      } catch {
        uploadErrors.push("Profile image upload failed.");
      }
    }

    // ── Firebase: delete documents marked for removal ──────────────────
    for (const path of docsToDelete) {
      try {
        await deleteObject(ref(storage, path));
      } catch {
        uploadErrors.push(`Failed to remove: ${path.split("/").pop()}`);
      }
    }

    // ── Firebase: upload new documents ────────────────────────────────
    const validDocs = documentFiles.filter((d) => d && d.file && d.title);
    if (validDocs.length > 0) {
      btnSave.textContent = "Uploading documents…";
      try {
        await uploadDocuments(editingEmployeeId, validDocs);
      } catch {
        uploadErrors.push("Some new documents failed to upload.");
      }
    }

    // ── SQL: update employee ───────────────────────────────────────────
    btnSave.textContent = "Saving…";
    const res = await fetch(`${API_BASE}/employees/${editingEmployeeId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        firstName,
        lastName,
        phoneNum,
        costPerHour,
        roleIds,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      showError(data.error || "Failed to update employee.");
      return;
    }

    formSuccess.textContent =
      uploadErrors.length > 0
        ? `Employee updated. Note: ${uploadErrors.join(" ")}`
        : `${firstName} ${lastName} was updated successfully.`;
    formSuccess.style.display = "block";

    await loadEmployees();
    setTimeout(closeModal, 1800);
  } catch {
    showError("Network error. Please check your connection.");
  } finally {
    setLoading(btnSave, false);
  }
}

// ── Delete modal ───────────────────────────────────────────────────────────
function openDeleteModal(employeeId, fullName) {
  pendingDeleteId = employeeId;
  pendingDeleteName = fullName;
  document.getElementById("delete-confirm-text").textContent =
    `Are you sure you want to permanently delete "${fullName}"?`;
  document.getElementById("delete-modal-overlay").classList.add("open");
}

function closeDeleteModal() {
  document.getElementById("delete-modal-overlay").classList.remove("open");
  pendingDeleteId = null;
  pendingDeleteName = null;
}

document
  .getElementById("delete-modal-close")
  .addEventListener("click", closeDeleteModal);
document
  .getElementById("delete-cancel")
  .addEventListener("click", closeDeleteModal);
document
  .getElementById("delete-modal-overlay")
  .addEventListener("click", (e) => {
    if (e.target === document.getElementById("delete-modal-overlay"))
      closeDeleteModal();
  });

document
  .getElementById("btn-confirm-delete")
  .addEventListener("click", async () => {
    if (!pendingDeleteId) return;

    const btn = document.getElementById("btn-confirm-delete");
    btn.disabled = true;
    btn.textContent = "Deleting…";

    try {
      const token = await getToken();

      // 1. Delete from SQL first — this is the authoritative source
      const res = await fetch(`${API_BASE}/employees/${pendingDeleteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete employee.");
        return;
      }

      // 2. Clean up Firebase Storage (best-effort — SQL is already done)
      try {
        await deleteEmployeeStorageFiles(pendingDeleteId);
      } catch {
        console.warn(
          "Firebase Storage cleanup failed for employee:",
          pendingDeleteId,
        );
      }

      closeDeleteModal();
      await loadEmployees();
    } catch {
      alert("Network error. Could not delete employee.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Delete Employee";
    }
  });

async function deleteEmployeeStorageFiles(employeeId) {
  // Delete profile folder
  try {
    const profileItems = await listAll(
      ref(storage, `employees/${employeeId}/profile`),
    );
    await Promise.all(profileItems.items.map((item) => deleteObject(item)));
  } catch {
    /* no profile folder */
  }

  // Delete documents folder
  try {
    const docsItems = await listAll(
      ref(storage, `employees/${employeeId}/documents`),
    );
    await Promise.all(docsItems.items.map((item) => deleteObject(item)));
  } catch {
    /* no documents folder */
  }
}

// ── Add role inline ────────────────────────────────────────────────────────
document.getElementById("btn-add-role").addEventListener("click", () => {
  if (document.getElementById("new-role-input-row")) return;

  const row = document.createElement("div");
  row.id = "new-role-input-row";
  row.style.cssText =
    "display:flex;gap:6px;align-items:center;margin-top:8px;width:100%";
  row.innerHTML = `
    <input id="new-role-input" type="text" placeholder="Role name…"
      style="flex:1;padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px" />
    <button type="button" id="btn-confirm-role"
      style="padding:6px 12px;background:#3b5bdb;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer">Add</button>
    <button type="button" id="btn-cancel-role"
      style="padding:6px 10px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer">✕</button>
  `;
  rolesGrid.after(row);

  const input = document.getElementById("new-role-input");
  input.focus();

  document
    .getElementById("btn-cancel-role")
    .addEventListener("click", () => row.remove());
  document
    .getElementById("btn-confirm-role")
    .addEventListener("click", () => submitNewRole(input, row));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitNewRole(input, row);
    if (e.key === "Escape") row.remove();
  });
});

async function submitNewRole(input, row) {
  const roleName = input.value.trim();
  if (!roleName) {
    input.focus();
    return;
  }

  const btn = document.getElementById("btn-confirm-role");
  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/roles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ roleName }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Failed to create role.");
      btn.disabled = false;
      btn.textContent = "Add";
      return;
    }

    const label = document.createElement("label");
    label.className = "role-check";
    label.innerHTML = `<input type="checkbox" value="__pending__" checked /> ${capitalize(roleName)}`;
    rolesGrid.appendChild(label);
    row.remove();

    await loadRoles();
    // Re-check the newly added role by name
    document
      .querySelectorAll("#roles-grid input[type='checkbox']")
      .forEach((cb) => {
        if (
          cb.closest("label")?.textContent.trim().toLowerCase() ===
          roleName.toLowerCase()
        )
          cb.checked = true;
      });
  } catch {
    alert("Network error. Could not save role.");
    btn.disabled = false;
    btn.textContent = "Add";
  }
}

// ── Profile image ──────────────────────────────────────────────────────────
profileFileInput.addEventListener("change", () => {
  const file = profileFileInput.files[0];
  if (!file) return;
  if (!validateImage(file)) {
    profileFileInput.value = "";
    return;
  }
  profileFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    profilePreview.src = e.target.result;
    profilePreview.style.display = "block";
    profilePlaceholder.style.display = "none";
    btnRemoveProfile.style.display = "inline-block";
  };
  reader.readAsDataURL(file);
});

btnRemoveProfile.addEventListener("click", (e) => {
  e.stopPropagation();
  replaceProfile = true; // mark existing profile for deletion on save
  profileFile = null;
  profileFileInput.value = "";
  profilePreview.style.display = "none";
  profilePreview.src = "";
  profilePlaceholder.style.display = "flex";
  btnRemoveProfile.style.display = "none";
});

function validateImage(file) {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) {
    showError("Profile image must be JPG, PNG, or WEBP.");
    return false;
  }
  if (file.size > 5 * 1024 * 1024) {
    showError("Profile image must be under 5 MB.");
    return false;
  }
  return true;
}

// ── Documents ───────────────────────────────────────────────────────────────
const DOC_TITLES = [
  "Form 101",
  "ID Copy",
  "Contract",
  "Medical Approval",
  "Other",
];

btnAddDoc.addEventListener("click", () => {
  // Show "Upload new files:" label in edit mode once user starts adding docs
  if (editingEmployeeId) {
    document.getElementById("new-docs-label").style.display = "block";
  }
  addDocumentRow();
});

function addDocumentRow() {
  // Remove empty state on first document added
  documentsList.querySelector(".empty-state-cta")?.remove();

  const idx = documentFiles.length;
  documentFiles.push({ file: null, title: "" });

  const item = document.createElement("div");
  item.className = "doc-item";

  const titleOptions = DOC_TITLES.map(
    (t) => `<option value="${t}">${t}</option>`,
  ).join("");

  item.innerHTML = `
    <select class="doc-title-select">
      <option value="">— Select title —</option>
      ${titleOptions}
    </select>
    <div class="doc-file-area">
      <span class="doc-file-name">No file chosen</span>
      <label class="btn-pick-file">
        Choose File
        <input type="file" accept=".pdf,.doc,.docx" style="position:absolute;opacity:0;width:0;height:0;overflow:hidden" />
      </label>
    </div>
    <button type="button" class="btn-remove-doc" title="Remove">✕</button>
  `;

  const select = item.querySelector(".doc-title-select");
  const fileInput = item.querySelector("input[type='file']");
  const fileNameSpan = item.querySelector(".doc-file-name");
  const removeBtn = item.querySelector(".btn-remove-doc");

  select.addEventListener("change", () => {
    if (documentFiles[idx]) documentFiles[idx].title = select.value;
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!validateDocument(file)) {
      fileInput.value = "";
      return;
    }
    if (documentFiles[idx]) documentFiles[idx].file = file;
    fileNameSpan.textContent = file.name;
    fileNameSpan.title = file.name;
  });

  removeBtn.addEventListener("click", () => {
    documentFiles[idx] = null;
    item.remove();
  });

  documentsList.appendChild(item);
}

function validateDocument(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (!["pdf", "doc", "docx"].includes(ext)) {
    alert("Documents must be PDF, DOC, or DOCX.");
    return false;
  }
  if (file.size > 10 * 1024 * 1024) {
    alert("Each document must be under 10 MB.");
    return false;
  }
  return true;
}

// ── Customer document rows (add-customer modal) ─────────────────────────────
document.getElementById("btn-cust-add-doc").addEventListener("click", () => {
  addCustomerDocumentRow();
});

function addCustomerDocumentRow() {
  const custDocsList = document.getElementById("cust-docs-list");
  const idx = custDocumentFiles.length;
  custDocumentFiles.push({ file: null, title: "" });

  const item = document.createElement("div");
  item.className = "doc-item";

  const titleOptions = DOC_TITLES.map(
    (t) => `<option value="${t}">${t}</option>`,
  ).join("");

  item.innerHTML = `
    <select class="doc-title-select">
      <option value="">— Select title —</option>
      ${titleOptions}
    </select>
    <div class="doc-file-area">
      <span class="doc-file-name">No file chosen</span>
      <label class="btn-pick-file">
        Choose File
        <input type="file" accept=".pdf,.doc,.docx" style="position:absolute;opacity:0;width:0;height:0;overflow:hidden" />
      </label>
    </div>
    <button type="button" class="btn-remove-doc" title="Remove">✕</button>
  `;

  const select = item.querySelector(".doc-title-select");
  const fileInput = item.querySelector("input[type='file']");
  const fileNameSpan = item.querySelector(".doc-file-name");
  const removeBtn = item.querySelector(".btn-remove-doc");

  select.addEventListener("change", () => {
    if (custDocumentFiles[idx]) custDocumentFiles[idx].title = select.value;
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!validateDocument(file)) {
      fileInput.value = "";
      return;
    }
    if (custDocumentFiles[idx]) custDocumentFiles[idx].file = file;
    fileNameSpan.textContent = file.name;
    fileNameSpan.title = file.name;
  });

  removeBtn.addEventListener("click", () => {
    custDocumentFiles[idx] = null;
    item.remove();
  });

  custDocsList.appendChild(item);
}

// ── Firebase Storage uploads ────────────────────────────────────────────────
async function uploadProfileImage(employeeId, file) {
  const ext = file.name.split(".").pop().toLowerCase();
  const storageRef = ref(
    storage,
    `employees/${employeeId}/profile/profile.${ext}`,
  );
  await uploadBytes(storageRef, file);
}

async function uploadDocuments(employeeId, docs) {
  for (const doc of docs) {
    if (!doc || !doc.file || !doc.title) continue;
    const safeTitle = doc.title.replace(/\s+/g, "-").toLowerCase();
    const safeName = `${safeTitle}-${doc.file.name}`;
    const storageRef = ref(
      storage,
      `employees/${employeeId}/documents/${safeName}`,
    );
    await uploadBytes(storageRef, doc.file);
  }
}

async function uploadCustomerDocuments(customerId, docs) {
  for (const doc of docs) {
    if (!doc || !doc.file || !doc.title) continue;
    const safeTitle = doc.title.replace(/\s+/g, "-").toLowerCase();
    const safeName = `${safeTitle}-${doc.file.name}`;
    const storageRef = ref(
      storage,
      `customers/${customerId}/documents/${safeName}`,
    );
    await uploadBytes(storageRef, doc.file);
  }
}

// ── Logout ─────────────────────────────────────────────────────────────────
btnLogout.addEventListener("click", async () => {
  destroyChat();
  await signOut(auth);
  sessionStorage.removeItem("userProfile");
  window.location.href = "/frontend/auth.html";
});

// ── Utilities ──────────────────────────────────────────────────────────────

// Inline SVG snippets for btn icon restoration after loading state
const _ICON = {
  check:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
  plus:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  folder: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
};

function showError(msg) {
  formError.textContent = msg;
  formError.style.display = "block";
}

function setLoading(btn, loading) {
  btn.disabled = loading;
  if (loading) {
    if (!btn.dataset.origHtml) btn.dataset.origHtml = btn.innerHTML;
    btn.textContent = "Saving…";
  } else {
    if (btn.dataset.origHtml) {
      btn.innerHTML = btn.dataset.origHtml;
      delete btn.dataset.origHtml;
    }
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escape(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ═══════════════════════════════════════════════════════════════════════════
// ── SECTION SWITCHING ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

document.querySelectorAll(".nav-item[data-section]").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    activateSection(item.dataset.section);
  });
});

function activateSection(name) {
  // Stop staffing poll whenever we leave both event-detail and project-detail
  if (name !== "project-detail" && name !== "event-detail") _stopStaffingPoll();

  document.querySelectorAll(".nav-item[data-section]").forEach((el) => {
    el.classList.toggle("active", el.dataset.section === name);
  });
  document.querySelectorAll(".page-section").forEach((el) => {
    el.style.display = el.dataset.section === name ? "" : "none";
  });

  // Toggle chat-mode class on page-content to remove padding and set fixed height
  document
    .querySelector(".page-content")
    .classList.toggle("chat-mode", name === "chats");

  if (name === "customers") loadCustomers();
  if (name === "projects") {
    _initProjectFilters();
    loadProjects();
  }
  if (name === "create-project") loadProjectCustomerDropdown();
  if (name === "chats") _initChatSection();
}

function _initChatSection() {
  if (chatInitialized) return;
  // Guard: onAuthStateChanged may not have fired yet on a very fast first click
  if (!profile || !currentFirebaseUid) return;
  chatInitialized = true;
  const container = document.getElementById("section-chats");
  initChat(container, profile, currentFirebaseUid);
}

// ── PROJECTS SECTION ────────────────────────────────────────────────────────

let _allProjects = [];

// ── Project filters state ──────────────────────────────────────────────────
let _filterDateFrom = null; // Date | null
let _filterDateTo = null; // Date | null
let _filterStatuses = new Set(); // empty = all

function _applyProjectFilters() {
  if (!_allProjects) return;
  let projects = _allProjects;

  if (_filterDateFrom || _filterDateTo) {
    projects = projects.filter((p) => {
      const start = p.startDate ? new Date(p.startDate) : null;
      const end = p.endDate ? new Date(p.endDate) : null;
      if (_filterDateFrom && end && end < _filterDateFrom) return false;
      if (_filterDateTo && start && start > _filterDateTo) return false;
      return true;
    });
  }

  if (_filterStatuses.size > 0) {
    projects = projects.filter((p) =>
      _filterStatuses.has(_computeProjectStatus(p)),
    );
  }

  _renderProjectKanban(projects);
  _updateFilterBtnState();
}

function _updateFilterBtnState() {
  const dateBtn = document.getElementById("filter-date");
  const statusBtn = document.getElementById("filter-status");
  if (dateBtn)
    dateBtn.classList.toggle(
      "btn-filter--active",
      !!(_filterDateFrom || _filterDateTo),
    );
  if (statusBtn)
    statusBtn.classList.toggle("btn-filter--active", _filterStatuses.size > 0);
}

let _projectFiltersInited = false;
function _initProjectFilters() {
  if (_projectFiltersInited) return;
  _projectFiltersInited = true;
  const dateBtn = document.getElementById("filter-date");
  const datePop = document.getElementById("filter-date-popup");
  const dateFrom = document.getElementById("filter-date-from");
  const dateTo = document.getElementById("filter-date-to");
  const dateApply = document.getElementById("filter-date-apply");
  const dateClear = document.getElementById("filter-date-clear");
  const statusBtn = document.getElementById("filter-status");
  const statusPop = document.getElementById("filter-status-popup");
  const statusClear = document.getElementById("filter-status-clear");

  if (!dateBtn || !statusBtn) return;

  // Toggle popups
  dateBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    datePop.hidden = !datePop.hidden;
    statusPop.hidden = true;
  });
  statusBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    statusPop.hidden = !statusPop.hidden;
    datePop.hidden = true;
  });
  document.addEventListener("click", () => {
    datePop.hidden = true;
    statusPop.hidden = true;
  });
  datePop.addEventListener("click", (e) => e.stopPropagation());
  statusPop.addEventListener("click", (e) => e.stopPropagation());

  // Date apply
  dateApply.addEventListener("click", () => {
    _filterDateFrom = dateFrom.value ? new Date(dateFrom.value) : null;
    _filterDateTo = dateTo.value ? new Date(dateTo.value) : null;
    if (_filterDateTo) _filterDateTo.setHours(23, 59, 59, 999);
    datePop.hidden = true;
    _applyProjectFilters();
  });
  dateClear.addEventListener("click", () => {
    _filterDateFrom = null;
    _filterDateTo = null;
    dateFrom.value = "";
    dateTo.value = "";
    datePop.hidden = true;
    _applyProjectFilters();
  });

  // Status checkboxes — live filter on change
  statusPop.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      _filterStatuses = new Set(
        [...statusPop.querySelectorAll("input[type=checkbox]:checked")].map(
          (c) => c.value,
        ),
      );
      _applyProjectFilters();
    });
  });
  statusClear.addEventListener("click", () => {
    statusPop
      .querySelectorAll("input[type=checkbox]")
      .forEach((cb) => (cb.checked = false));
    _filterStatuses = new Set();
    _applyProjectFilters();
  });
}

async function loadProjects() {
  const cols = {
    today: document.getElementById("kanban-today"),
    upcoming: document.getElementById("kanban-upcoming"),
    completed: document.getElementById("kanban-completed"),
    draft: document.getElementById("kanban-draft"),
  };

  Object.values(cols).forEach((col) => {
    col.innerHTML = `<div class="empty-col">Loading…</div>`;
  });

  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to load projects.");
    _allProjects = await res.json();
    _applyProjectFilters();
  } catch {
    Object.values(cols).forEach((col) => {
      col.innerHTML = `<div class="empty-col" style="color:#ef4444">Failed to load.</div>`;
    });
  }
}

function _renderProjectKanban(projects) {
  const cols = {
    today: document.getElementById("kanban-today"),
    upcoming: document.getElementById("kanban-upcoming"),
    completed: document.getElementById("kanban-completed"),
    draft: document.getElementById("kanban-draft"),
  };

  const buckets = { today: [], upcoming: [], completed: [], draft: [] };
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  for (const p of projects) {
    const computed = _computeProjectStatus(p, todayDate);
    switch (computed) {
      case "draft":
        buckets.draft.push(p);
        break;
      case "canceled":
        buckets.completed.push(p);
        break;
      case "completed":
        buckets.completed.push(p);
        break;
      case "active":
        buckets.today.push(p);
        break;
      default:
        buckets.upcoming.push(p);
        break; // planning
    }
  }

  for (const [key, col] of Object.entries(cols)) {
    const items = buckets[key];
    col.innerHTML = items.length
      ? items.map((p) => renderProjectCard(p)).join("")
      : `<div class="empty-col">No projects</div>`;
  }
}

// Compute display status from DB status + dates (no DB writes)
function _computeProjectStatus(project, todayDate) {
  if (project.status === "draft") return "draft";
  if (project.status === "canceled") return "canceled";
  if (!project.startDate || !project.endDate) return "planning";
  const start = new Date(project.startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(project.endDate);
  end.setHours(0, 0, 0, 0);
  const today =
    todayDate ??
    (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    })();
  if (today < start) return "planning";
  if (today > end) return "completed";
  return "active";
}

function renderProjectCard(project) {
  const statusMap = {
    draft: { label: "Draft", cls: "badge-pending" },
    planning: { label: "Planning", cls: "badge-info" },
    active: { label: "Active", cls: "badge-active" },
    completed: { label: "Completed", cls: "badge-success" },
    canceled: { label: "Canceled", cls: "badge-error" },
  };
  const computed = _computeProjectStatus(project);
  const badge = statusMap[computed] ?? {
    label: computed,
    cls: "badge-pending",
  };
  const fmt = (d) =>
    d
      ? new Date(d).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—";
  const pct =
    project.requiredCount > 0
      ? Math.min(
          100,
          Math.round((project.staffedCount / project.requiredCount) * 100),
        )
      : 0;
  const customer = project.customerName
    ? escapeHtml(project.customerName)
    : "No customer";

  return `
    <div class="event-card" data-proj-id="${escapeHtml(project.projId)}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
        <span class="event-status-badge ${badge.cls}">${badge.label}</span>
      </div>
      <div class="event-title">${escapeHtml(project.name)}</div>
      <div class="event-meta">
        <span class="material-symbols-outlined" style="font-size:13px">calendar_month</span>
        ${fmt(project.startDate)} – ${fmt(project.endDate)}
      </div>
      <div class="event-meta">
        <span class="material-symbols-outlined" style="font-size:13px">business</span>
        ${customer}
      </div>
      <div class="staffing-bar">
        <div class="staffing-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="event-meta">
        <span class="material-symbols-outlined" style="font-size:13px">group</span>
        ${project.staffedCount} / ${project.requiredCount} workers staffed
      </div>
    </div>
  `;
}

document.getElementById("search-projects")?.addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  const filtered = q
    ? _allProjects.filter((p) => (p.name || "").toLowerCase().includes(q))
    : _allProjects;
  _renderProjectKanban(filtered);
});

document.getElementById("btn-create-project").addEventListener("click", () => {
  activateSection("create-project");
  initCreateProjectForm();
});

// ── Double-click on kanban card → open project detail ───────────────────────
document.querySelector(".events-kanban").addEventListener("dblclick", (e) => {
  const card = e.target.closest(".event-card[data-proj-id]");
  if (!card) return;
  openProjectDetail(card.dataset.projId);
});

// ── PROJECT DETAIL SECTION ─────────────────────────────────────────────────

let currentProjectId = null; // tracks which project is open in the detail view
let currentProjectDetail = null; // holds last fetched ProjectDetailResponse
let _pdTasksData = null; // cached tasks array for current project
let _pdBriefsData = null; // cached briefs array for current project
let _expandedRow = null; // currently expanded task/brief DOM row
let _taskFilterStatus = "all"; // active status filter pill value
let _taskFilterPriority = "all"; // active priority filter pill value

document
  .getElementById("btn-back-from-project-detail")
  .addEventListener("click", () => {
    _stopStaffingPoll();
    activateSection("projects");
  });

// Tab switching inside project detail
document.querySelectorAll(".pd-tab").forEach((tab) => {
  tab.addEventListener("click", () => activateProjectTab(tab.dataset.tab));
});

function activateProjectTab(name) {
  _stopStaffingPoll();
  document.querySelectorAll(".pd-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === name);
  });
  document.querySelectorAll(".pd-panel").forEach((p) => {
    p.style.display = p.dataset.tabPanel === name ? "" : "none";
  });
  if (name === "dashboard") renderDashboardTab();
  if (name === "tasks") renderTasksTab();
  if (name === "brief") renderBriefTab();
  if (name === "finance") renderProjectFinanceTab();
  if (name === "schedule" && currentProjectId) {
    loadProjectSchedule(currentProjectId);
  }
}

async function openProjectDetail(projId) {
  currentProjectId = projId;
  // Reset to dashboard tab and show the section
  currentProjectDetail = null;
  _pdTasksData = null;
  _pdBriefsData = null;
  _expandedRow = null;
  _taskFilterStatus = "all";
  _taskFilterPriority = "all";
  resetTaskFilterPills();
  const taskList = document.getElementById("pd-task-list");
  const briefList = document.getElementById("pd-brief-list");
  if (taskList) taskList.innerHTML = "";
  if (briefList) briefList.innerHTML = "";
  activateProjectTab("dashboard");
  activateSection("project-detail");

  const titleEl = document.getElementById("project-detail-title");
  const subtitleEl = document.getElementById("project-detail-subtitle");
  titleEl.textContent = "Loading…";
  subtitleEl.textContent = "";

  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/projects/${encodeURIComponent(projId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) throw new Error("Failed to load project.");
    const project = await res.json();

    currentProjectDetail = project;
    titleEl.textContent = escapeHtml(project.name);
    subtitleEl.textContent = `${project.status} · ${project.eventCount} event${project.eventCount !== 1 ? "s" : ""}`;
    renderDashboardTab();
  } catch {
    titleEl.textContent = "Error loading project";
    subtitleEl.textContent = "";
  }
}

// ── Dashboard tab — event cards ───────────────────────────────────────────

function renderDashboardTab() {
  const container = document.getElementById("pd-dashboard-events");
  if (!container) return;

  const project = currentProjectDetail;
  if (!project) {
    container.innerHTML = `<div class="pd-placeholder">Loading…</div>`;
    return;
  }

  const events = project.events ?? [];
  if (!events.length) {
    container.innerHTML = `
      <div class="pd-dash-empty">
        <span class="material-symbols-outlined">event_busy</span>
        No events in this project yet.
      </div>`;
    return;
  }

  const statusMeta = {
    planning: { label: "Planning", cls: "ev-status--planning" },
    active: { label: "Active", cls: "ev-status--active" },
    completed: { label: "Completed", cls: "ev-status--completed" },
    canceled: { label: "Canceled", cls: "ev-status--canceled" },
  };
  const typeMeta = {
    conference: { icon: "groups", label: "Conference" },
    exhibition: { icon: "store", label: "Exhibition" },
    concert: { icon: "music_note", label: "Concert" },
    gala: { icon: "celebration", label: "Gala" },
    corporate: { icon: "business", label: "Corporate" },
    wedding: { icon: "favorite", label: "Wedding" },
    workshop: { icon: "construction", label: "Workshop" },
    seminar: { icon: "school", label: "Seminar" },
    other: { icon: "event", label: "Event" },
  };

  const fmtDate = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };
  const fmtTime = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const daysBetween = (a, b) => {
    if (!a || !b) return null;
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  };

  const cards = events
    .map((ev, i) => {
      const sm = statusMeta[ev.status] ?? {
        label: ev.status,
        cls: "ev-status--planning",
      };
      const tm = typeMeta[ev.eventType?.toLowerCase()] ?? typeMeta.other;
      const duration = daysBetween(ev.startTime, ev.endTime);
      const durationLabel =
        duration != null
          ? duration === 0
            ? "Same day"
            : `${duration} day${duration !== 1 ? "s" : ""}`
          : "";

      return `
      <div class="ev-card" style="--ev-index:${i}" data-event-id="${escapeHtml(ev.eventId)}">
        <div class="ev-card-accent"></div>
        <div class="ev-card-body">
          <div class="ev-card-top">
            <div class="ev-card-type">
              <span class="material-symbols-outlined ev-type-icon">${tm.icon}</span>
              <span class="ev-type-label">${escapeHtml(tm.label)}</span>
            </div>
            <span class="ev-status-badge ${sm.cls}">${sm.label}</span>
          </div>
          <h3 class="ev-card-title">${escapeHtml(ev.name || "Untitled Event")}</h3>
          <div class="ev-card-meta">
            ${
              ev.location
                ? `
              <div class="ev-meta-row">
                <span class="material-symbols-outlined ev-meta-icon">location_on</span>
                <span>${escapeHtml(ev.location)}</span>
              </div>`
                : ""
            }
            <div class="ev-meta-row">
              <span class="material-symbols-outlined ev-meta-icon">calendar_today</span>
              <span>${fmtDate(ev.startTime)}</span>
            </div>
            <div class="ev-meta-row">
              <span class="material-symbols-outlined ev-meta-icon">schedule</span>
              <span>${fmtTime(ev.startTime)} – ${fmtTime(ev.endTime)}${durationLabel ? ` · ${durationLabel}` : ""}</span>
            </div>
          </div>
        </div>
        <div class="ev-card-index">${String(i + 1).padStart(2, "0")}</div>
      </div>`;
    })
    .join("");

  container.innerHTML = `<div class="ev-grid">${cards}</div>`;

  // Delegated click — open event detail
  container.querySelector(".ev-grid")?.addEventListener("click", (e) => {
    const card = e.target.closest("[data-event-id]");
    if (card) openEventDetail(card.dataset.eventId);
  });
}

// ── Load and render the Gantt schedule tab ─────────────────────────────────

async function loadProjectSchedule(projId) {
  const container = document.getElementById("gantt-container");
  container.innerHTML = `
    <div class="pd-placeholder">
      <span class="material-symbols-outlined" style="font-size:40px;margin-bottom:8px">hourglass_top</span>
      Loading schedule…
    </div>`;
  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/projects/${encodeURIComponent(projId)}/schedule`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) throw new Error("Failed to load schedule.");
    const schedule = await res.json();
    renderGantt(schedule);
  } catch {
    container.innerHTML = `
      <div class="pd-placeholder" style="color:var(--red)">
        <span class="material-symbols-outlined" style="font-size:40px;margin-bottom:8px">error</span>
        Failed to load schedule.
      </div>`;
  }
}

function renderGantt(schedule) {
  const container = document.getElementById("gantt-container");

  if (!schedule.events || schedule.events.length === 0) {
    container.innerHTML = `
      <div class="pd-placeholder">
        <span class="material-symbols-outlined" style="font-size:40px;margin-bottom:8px">calendar_month</span>
        No events in this project yet.
      </div>`;
    return;
  }

  // Color palette assigned per role name (consistent within the chart)
  const GANTT_COLORS = [
    { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af" },
    { bg: "#d1fae5", border: "#10b981", text: "#065f46" },
    { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" },
    { bg: "#ede9fe", border: "#8b5cf6", text: "#4c1d95" },
    { bg: "#fee2e2", border: "#ef4444", text: "#991b1b" },
    { bg: "#e0f2fe", border: "#0ea5e9", text: "#0369a1" },
    { bg: "#fce7f3", border: "#ec4899", text: "#9d174d" },
    { bg: "#ccfbf1", border: "#14b8a6", text: "#115e59" },
  ];
  const roleColorMap = {};
  let colorIdx = 0;

  function getColor(roleName) {
    if (!roleColorMap[roleName]) {
      roleColorMap[roleName] = GANTT_COLORS[colorIdx % GANTT_COLORS.length];
      colorIdx++;
    }
    return roleColorMap[roleName];
  }

  function fmt2(n) {
    return String(n).padStart(2, "0");
  }
  // Converts a UTC ISO string to the local datetime-local input format (YYYY-MM-DDTHH:mm)
  function toLocalDateTimeInput(isoStr) {
    const d = new Date(isoStr);
    return `${d.getFullYear()}-${fmt2(d.getMonth() + 1)}-${fmt2(d.getDate())}T${fmt2(d.getHours())}:${fmt2(d.getMinutes())}`;
  }
  function fmtTime(isoStr) {
    if (!isoStr) return "";
    const d = new Date(isoStr);
    return `${fmt2(d.getHours())}:${fmt2(d.getMinutes())}`;
  }
  function fmtDate(isoStr) {
    if (!isoStr) return "";
    return new Date(isoStr).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  // Returns minutes from day-start, adding 1440 for cross-midnight times
  function toMinutes(isoStr, refIsoStr) {
    if (!isoStr) return 0;
    const d = new Date(isoStr);
    let m = d.getHours() * 60 + d.getMinutes();
    if (refIsoStr) {
      const ref = new Date(refIsoStr);
      const sameDay =
        d.getFullYear() === ref.getFullYear() &&
        d.getMonth() === ref.getMonth() &&
        d.getDate() === ref.getDate();
      if (!sameDay && d > ref) m += 1440;
    }
    return m;
  }

  const sectionsHtml = schedule.events
    .map((ev) => {
      const dateLabel = ev.startTime
        ? `${fmtDate(ev.startTime)} · ${fmtTime(ev.startTime)}–${fmtTime(ev.endTime)}`
        : "";

      // Compute windowed axis: from earliest shift start to latest shift end
      let winStart = Infinity;
      let winEnd = 0;
      ev.shifts.forEach((shift) => {
        const s = toMinutes(shift.startTime);
        const e = toMinutes(shift.endTime, shift.startTime);
        if (s < winStart) winStart = s;
        if (e > winEnd) winEnd = e;
      });
      // Fallback for empty events
      if (!isFinite(winStart)) {
        winStart = 0;
        winEnd = 1440;
      }
      // Pad 1h on each side, snap to 1h boundaries for clean labels
      winStart = Math.max(0, Math.floor((winStart - 60) / 60) * 60);
      winEnd = Math.ceil((winEnd + 60) / 60) * 60;
      const spanMinutes = winEnd - winStart;

      // Build axis ticks — one per hour inside the window (max ~12 ticks)
      const tickStep = spanMinutes <= 480 ? 60 : 120; // 1h ticks for short spans, 2h for long
      const axisTicks = [];
      for (let m = winStart; m <= winEnd; m += tickStep) {
        const pct = ((m - winStart) / spanMinutes) * 100;
        const hAbs = Math.floor(m / 60);
        const label = `${fmt2(hAbs % 24)}:00${hAbs >= 24 ? " +1" : ""}`;
        axisTicks.push(
          `<div class="gantt-hour-tick" style="left:${pct.toFixed(2)}%">${label}</div>`,
        );
      }

      const rowsHtml =
        ev.shifts.length === 0
          ? `<div class="gantt-empty-row">No shifts defined for this event</div>`
          : ev.shifts
              .map((shift) => {
                const color = getColor(shift.roleName);
                const leftM = toMinutes(shift.startTime);
                const rightM = toMinutes(shift.endTime, shift.startTime);
                const left = ((leftM - winStart) / spanMinutes) * 100;
                const width = Math.max(
                  ((rightM - leftM) / spanMinutes) * 100,
                  2,
                );
                const label = `${escapeHtml(shift.roleName)} ${shift.staffedCount}/${shift.requiredQuantity}`;
                return `
            <div class="gantt-row">
              <div class="gantt-row-label">${escapeHtml(shift.roleName)}</div>
              <div class="gantt-row-track">
                <div class="gantt-bar"
                     style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;background:${color.bg};border-color:${color.border};color:${color.text}">
                  <span class="gantt-bar-label">${label}</span>
                  <div class="gantt-bar-actions">
                    <button class="gantt-bar-btn gantt-bar-btn-edit" type="button" title="Edit shift"
                            data-shift-id="${escapeHtml(shift.shiftId)}"
                            data-role-id="${escapeHtml(shift.roleId)}"
                            data-start="${shift.startTime ? toLocalDateTimeInput(shift.startTime) : ""}"
                            data-end="${shift.endTime ? toLocalDateTimeInput(shift.endTime) : ""}"
                            data-qty="${shift.requiredQuantity}">
                      <i data-lucide="pencil" style="width:11px;height:11px"></i>
                    </button>
                    <button class="gantt-bar-btn gantt-bar-btn-delete" type="button" title="Delete shift"
                            data-shift-id="${escapeHtml(shift.shiftId)}">
                      <i data-lucide="trash-2" style="width:11px;height:11px"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>`;
              })
              .join("");

      return `
      <div class="gantt-event-section">
        <div class="gantt-event-header">
          <span class="gantt-event-name">${escapeHtml(ev.eventName)}</span>
          <span class="gantt-event-date">${escapeHtml(dateLabel)}</span>
        </div>
        <div class="gantt-chart" dir="ltr">
          <div class="gantt-axis-row">
            <div class="gantt-row-label"></div>
            <div class="gantt-axis-track">${axisTicks.join("")}</div>
          </div>
          ${rowsHtml}
        </div>
        <div class="gantt-footer">
          <button class="btn-add-shift-gantt" type="button"
                  data-event-id="${escapeHtml(ev.eventId)}"
                  data-event-date="${ev.startTime ? new Date(ev.startTime).toISOString().slice(0, 10) : ""}">+ Add Shift</button>
        </div>
      </div>`;
    })
    .join("");

  container.innerHTML = sectionsHtml;

  // Re-initialize Lucide icons for newly rendered elements
  if (window.lucide) lucide.createIcons();
}

// ── ADD TASK / ADD BRIEF buttons ────────────────────────────────────────────

document
  .getElementById("btn-add-task")
  .addEventListener("click", () => addNewTaskRow());
document
  .getElementById("btn-add-brief")
  .addEventListener("click", () => addNewBriefRow());

document.getElementById("pd-task-filter-bar").addEventListener("click", (e) => {
  const clearBtn = e.target.closest("#btn-clear-task-filters");
  if (clearBtn) {
    _taskFilterStatus = "all";
    _taskFilterPriority = "all";
    resetTaskFilterPills();
    applyTaskFilters();
    return;
  }
  const pill = e.target.closest(".pd-filter-pill");
  if (!pill) return;
  const { filter, value } = pill.dataset;
  if (filter === "status") _taskFilterStatus = value;
  if (filter === "priority") _taskFilterPriority = value;
  // Update active pill within the group
  document
    .querySelectorAll(
      `#pd-task-filter-bar .pd-filter-pill[data-filter="${filter}"]`,
    )
    .forEach((p) => p.classList.toggle("active", p.dataset.value === value));
  // Show/hide clear button
  const showClear =
    _taskFilterStatus !== "all" || _taskFilterPriority !== "all";
  document.getElementById("btn-clear-task-filters").style.display = showClear
    ? ""
    : "none";
  applyTaskFilters();
});

// ── TASKS TAB ───────────────────────────────────────────────────────────────

const TASK_STATUSES = ["open", "in_progress", "done", "canceled"];

async function renderTasksTab() {
  if (!currentProjectDetail) return;

  // Already loaded — just re-apply filters from cache
  if (_pdTasksData !== null) {
    applyTaskFilters();
    return;
  }

  TASK_STATUSES.forEach((status) => {
    const col = document.getElementById(`pd-col-${status}`);
    if (col) col.innerHTML = '<div class="pd-loading">Loading…</div>';
  });

  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/projects/${encodeURIComponent(currentProjectDetail.projId)}/tasks`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error();
    _pdTasksData = await res.json();
    applyTaskFilters();
  } catch {
    TASK_STATUSES.forEach((status) => {
      const col = document.getElementById(`pd-col-${status}`);
      if (col) col.innerHTML = "";
    });
    const openCol = document.getElementById("pd-col-open");
    if (openCol)
      openCol.innerHTML = '<div class="pd-loading">Failed to load tasks.</div>';
  }
}

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

function applyTaskFilters() {
  if (_pdTasksData === null) return;
  // Don't re-render while an unsaved new row is open
  const openCol = document.getElementById("pd-col-open");
  if (openCol && openCol.querySelector('[data-new="true"]')) return;
  // Clear stale expanded row reference (DOM will be replaced)
  if (_expandedRow) _expandedRow = null;

  const filtered = _pdTasksData.filter(
    (t) => _taskFilterPriority === "all" || t.priority === _taskFilterPriority,
  );
  filtered.sort(
    (a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99),
  );

  TASK_STATUSES.forEach((status) => {
    const col = document.getElementById(`pd-col-${status}`);
    const countEl = document.getElementById(`pd-col-count-${status}`);
    if (!col) return;
    const colWrapper = col.closest(".pd-kanban-col");
    const colTasks = filtered.filter((t) => t.status === status);
    if (colTasks.length === 0) {
      col.innerHTML = "";
      if (countEl) countEl.textContent = "0";
      if (colWrapper) colWrapper.style.display = "none";
      return;
    }
    if (colWrapper) colWrapper.style.display = "";
    if (countEl) countEl.textContent = colTasks.length;
    col.innerHTML = "";
    colTasks.forEach((t) => col.appendChild(buildTaskRow(t)));
  });
}

function resetTaskFilterPills() {
  document
    .querySelectorAll("#pd-task-filter-bar .pd-filter-pill")
    .forEach((p) => {
      p.classList.toggle("active", p.dataset.value === "all");
    });
  const clearBtn = document.getElementById("btn-clear-task-filters");
  if (clearBtn) clearBtn.style.display = "none";
}

function buildTaskRow(task) {
  const row = document.createElement("div");
  row.className = `pd-task-row pd-task-row--${task.status}`;
  row.dataset.taskId = task.taskId;
  row.innerHTML = `
    <div class="pd-row-summary">
      <span class="pd-task-content">${escapeHtml(task.content)}</span>
      <div class="pd-row-meta">
        <span class="pd-badge pd-badge--priority-${task.priority}">${task.priority}</span>
        <button class="pd-row-delete-btn" title="Delete task" aria-label="Delete task">&#10005;</button>
      </div>
    </div>
    <div class="pd-row-form">
      <label class="pd-field-label">Content</label>
      <input type="text" class="pd-form-input" name="content" value="${escapeHtml(task.content)}" placeholder="Task description…" maxlength="500">
      <div class="pd-form-selects">
        <div class="pd-select-field">
          <label class="pd-field-label">Status</label>
          <select class="pd-form-select" name="status">
            ${["open", "in_progress", "done", "canceled"]
              .map(
                (s) =>
                  `<option value="${s}"${task.status === s ? " selected" : ""}>${s.replace("_", " ")}</option>`,
              )
              .join("")}
          </select>
        </div>
        <div class="pd-select-field">
          <label class="pd-field-label">Priority</label>
          <select class="pd-form-select" name="priority">
            ${["low", "medium", "high", "urgent"]
              .map(
                (p) =>
                  `<option value="${p}"${task.priority === p ? " selected" : ""}>${p}</option>`,
              )
              .join("")}
          </select>
        </div>
      </div>
      <div class="pd-form-actions">
        <button class="pd-form-save-btn" disabled>Save</button>
        <button class="pd-form-cancel-btn">Cancel</button>
      </div>
    </div>`;
  wireTaskRow(row, task);
  return row;
}

function wireTaskRow(row, task) {
  const summary = row.querySelector(".pd-row-summary");
  const form = row.querySelector(".pd-row-form");
  const contentIn = row.querySelector('input[name="content"]');
  const statusSel = row.querySelector('select[name="status"]');
  const prioritySel = row.querySelector('select[name="priority"]');
  const saveBtn = row.querySelector(".pd-form-save-btn");
  const cancelBtn = row.querySelector(".pd-form-cancel-btn");
  const deleteBtn = row.querySelector(".pd-row-delete-btn");

  // Toggle expand on summary click
  summary.addEventListener("click", (e) => {
    if (e.target === deleteBtn || deleteBtn.contains(e.target)) return;
    if (row.classList.contains("pd-row--deleting")) return;
    if (_expandedRow === row) {
      collapseRow(row);
      return;
    }
    if (_expandedRow) collapseRow(_expandedRow);
    _expandedRow = row;
    form.classList.add("expanded");
    row.classList.add("pd-row--expanded");
  });

  // Dirty detection
  const isDirty = () =>
    contentIn.value.trim() !== task.content ||
    statusSel.value !== task.status ||
    prioritySel.value !== task.priority;

  [contentIn, statusSel, prioritySel].forEach((el) =>
    el.addEventListener("input", () => {
      saveBtn.disabled = !isDirty();
    }),
  );

  cancelBtn.addEventListener("click", () => collapseRow(row));

  saveBtn.addEventListener("click", async () => {
    if (!isDirty()) return;
    const content = contentIn.value.trim();
    const status = statusSel.value;
    const priority = prioritySel.value;
    if (!content) {
      contentIn.focus();
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE}/projects/${encodeURIComponent(currentProjectDetail.projId)}/tasks/${encodeURIComponent(task.taskId)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content, status, priority }),
        },
      );
      if (!res.ok) throw new Error();
      const updated = await res.json();
      // Update cache
      const idx = _pdTasksData.findIndex((t) => t.taskId === task.taskId);
      if (idx !== -1) _pdTasksData[idx] = updated;
      // Re-apply filters (re-renders list, respects sort/filter changes)
      applyTaskFilters();
    } catch {
      saveBtn.textContent = "Save";
      saveBtn.disabled = false;
    }
  });

  wireTaskDeleteBtn(row, deleteBtn, task);
}

function wireTaskDeleteBtn(row, deleteBtn, task) {
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (row.classList.contains("pd-row--deleting")) return;

    // Collapse any expanded row first
    if (_expandedRow && _expandedRow !== row) collapseRow(_expandedRow);
    if (_expandedRow === row) collapseRow(row);

    row.classList.add("pd-row--deleting");

    const confirm = document.createElement("div");
    confirm.className = "pd-delete-confirm";
    confirm.innerHTML = `<span>Delete this task?</span>
      <button class="btn-confirm-yes">Delete</button>
      <button class="btn-confirm-no">Cancel</button>`;
    row.querySelector(".pd-row-summary").appendChild(confirm);

    confirm.querySelector(".btn-confirm-no").addEventListener("click", (e) => {
      e.stopPropagation();
      row.classList.remove("pd-row--deleting");
      confirm.remove();
    });

    confirm
      .querySelector(".btn-confirm-yes")
      .addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          const token = await getToken();
          const res = await fetch(
            `${API_BASE}/projects/${encodeURIComponent(currentProjectDetail.projId)}/tasks/${encodeURIComponent(task.taskId)}`,
            { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
          );
          if (!res.ok) throw new Error();
          _pdTasksData = _pdTasksData.filter((t) => t.taskId !== task.taskId);
          if (_expandedRow === row) _expandedRow = null;
          applyTaskFilters();
        } catch {
          row.classList.remove("pd-row--deleting");
          confirm.remove();
        }
      });
  });
}

function collapseRow(row) {
  row.querySelector(".pd-row-form")?.classList.remove("expanded");
  row.classList.remove("pd-row--expanded");
  if (_expandedRow === row) _expandedRow = null;
}

function addNewTaskRow() {
  const list = document.getElementById("pd-col-open");
  if (!list) return;
  // Prevent double-add
  if (list.querySelector('[data-new="true"]')) return;
  // Ensure the open column is visible (may be hidden if it had no tasks)
  const colWrapper = list.closest(".pd-kanban-col");
  if (colWrapper) colWrapper.style.display = "";

  const tempTask = {
    taskId: "",
    content: "",
    status: "open",
    priority: "medium",
  };
  const row = buildTaskRow(tempTask);
  row.dataset.new = "true";
  // Hide delete on unsaved rows — taskId is empty so DELETE would hit the collection endpoint (405)
  row.querySelector(".pd-row-delete-btn").style.display = "none";

  // Re-wire save for CREATE instead of UPDATE
  const form = row.querySelector(".pd-row-form");
  const contentIn = row.querySelector('input[name="content"]');
  const statusSel = row.querySelector('select[name="status"]');
  const prioritySel = row.querySelector('select[name="priority"]');
  const saveBtn = row.querySelector(".pd-form-save-btn");
  const cancelBtn = row.querySelector(".pd-form-cancel-btn");

  cancelBtn.addEventListener("click", () => {
    if (_expandedRow === row) _expandedRow = null;
    row.remove();
    if (_pdTasksData !== null) applyTaskFilters();
    else list.innerHTML = '<div class="pd-kanban-empty">No tasks</div>';
  });

  // Replace the wired save from buildTaskRow with a fresh CREATE handler
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.replaceWith(newSaveBtn);
  newSaveBtn.disabled = true;
  contentIn.addEventListener("input", () => {
    newSaveBtn.disabled = contentIn.value.trim() === "";
  });

  newSaveBtn.addEventListener("click", async () => {
    const content = contentIn.value.trim();
    const status = statusSel.value;
    const priority = prioritySel.value;
    if (!content) {
      contentIn.focus();
      return;
    }

    newSaveBtn.disabled = true;
    newSaveBtn.textContent = "Saving…";
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE}/projects/${encodeURIComponent(currentProjectDetail.projId)}/tasks`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content, status, priority }),
        },
      );
      if (!res.ok) throw new Error();
      const created = await res.json();
      if (_pdTasksData === null) _pdTasksData = [];
      _pdTasksData.push(created);
      if (_expandedRow === row) _expandedRow = null;
      row.remove();
      applyTaskFilters();
    } catch {
      newSaveBtn.textContent = "Save";
      newSaveBtn.disabled = false;
    }
  });

  // Collapse any currently expanded row
  if (_expandedRow) collapseRow(_expandedRow);

  // Remove empty state placeholder if present
  const emptyEl = list.querySelector(".pd-kanban-empty");
  if (emptyEl) emptyEl.remove();

  list.prepend(row);
  // Expand immediately
  _expandedRow = row;
  requestAnimationFrame(() => {
    form.classList.add("expanded");
    row.classList.add("pd-row--expanded");
    contentIn.focus();
  });
}

// ── PROJECT FINANCE TAB ──────────────────────────────────────────────────────

async function renderProjectFinanceTab() {
  const root = document.getElementById("pd-finance-root");
  if (!root) return;
  root.innerHTML = '<div class="pd-loading">Loading project finances…</div>';

  const events = currentProjectDetail?.events ?? [];
  if (events.length === 0) {
    root.innerHTML = '<div class="pd-empty-state">No events in this project yet.</div>';
    return;
  }

  try {
    const token = await getToken();
    const fmt = (n) => `₪${(n || 0).toLocaleString("en-IL", { minimumFractionDigits: 2 })}`;

    // Fetch payroll + expenses for all events in parallel
    const results = await Promise.all(events.map(async (ev) => {
      const [prRes, exRes] = await Promise.all([
        fetch(`${API_BASE}/events/${encodeURIComponent(ev.eventId)}/payroll`,  { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/events/${encodeURIComponent(ev.eventId)}/expenses`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const payroll  = prRes.ok ? await prRes.json()  : [];
      const expenses = exRes.ok ? await exRes.json()  : [];
      return { ev, payroll, expenses };
    }));

    function calcLaborCost(totalHours, baseRate) {
      if (!totalHours || !baseRate) return 0;
      const regHours = Math.min(totalHours, 8);
      const otHours  = Math.max(0, totalHours - 8);
      const tier1    = Math.min(otHours, 2) * baseRate * 1.25;
      const tier2    = Math.max(0, otHours - 2) * baseRate * 1.5;
      return regHours * baseRate + tier1 + tier2;
    }

    let totalPlanned  = 0;
    let totalRevenue  = 0;
    let totalLabor    = 0;
    let totalExpenses = 0;

    const rows = results.map(({ ev, payroll, expenses }) => {
      const finPay = (payroll ?? []).filter(p =>
        p.approvedAt && (p.paymentStatus === "approved" || p.paymentStatus === "paid")
      );
      const labor = finPay.reduce((sum, p) => {
        const baseRate = p.payRatePerHour ?? p.defaultPayRate ?? 0;
        const hrs = (p.approvedRegularHours ?? 0) + (p.approvedOvertimeHours ?? 0);
        return sum + calcLaborCost(hrs, baseRate) + (p.travelRefund ?? 0) + (p.bonusAmount ?? 0) - (p.penaltyAmount ?? 0);
      }, 0);
      const expTotal = (expenses ?? []).reduce((s, e) => s + (e.amount ?? 0), 0);
      const total    = labor + expTotal;

      if (ev.plannedBudget)   totalPlanned  += ev.plannedBudget;
      if (ev.expectedRevenue) totalRevenue  += ev.expectedRevenue;
      totalLabor    += labor;
      totalExpenses += expTotal;

      const profitLoss = (ev.expectedRevenue ?? 0) - total;
      const plCls = profitLoss >= 0 ? "pf-positive" : "pf-negative";

      return `<tr>
        <td>${escapeHtml(ev.name)}</td>
        <td>${ev.plannedBudget  != null ? fmt(ev.plannedBudget)  : "—"}</td>
        <td>${ev.expectedRevenue != null ? fmt(ev.expectedRevenue) : "—"}</td>
        <td>${fmt(labor)}</td>
        <td>${fmt(expTotal)}</td>
        <td><strong>${fmt(total)}</strong></td>
        <td class="${plCls}">${ev.expectedRevenue != null ? `${profitLoss >= 0 ? "+" : ""}${fmt(profitLoss)}` : "—"}</td>
      </tr>`;
    }).join("");

    const grandTotal  = totalLabor + totalExpenses;
    const profitTotal = totalRevenue - grandTotal;
    const profitCls   = profitTotal >= 0 ? "ed-finance-card--profit" : "ed-finance-card--loss";

    root.innerHTML = `
      <div class="ed-finance-cards">
        ${totalPlanned  > 0 ? `<div class="ed-finance-card ed-finance-card--plan"><div class="ed-finance-card-label">Total Planned Budget</div><div class="ed-finance-card-value">${fmt(totalPlanned)}</div></div>` : ""}
        ${totalRevenue  > 0 ? `<div class="ed-finance-card ed-finance-card--rev"><div class="ed-finance-card-label">Total Expected Revenue</div><div class="ed-finance-card-value">${fmt(totalRevenue)}</div></div>` : ""}
        <div class="ed-finance-card"><div class="ed-finance-card-label">Total Labor Cost</div><div class="ed-finance-card-value">${fmt(totalLabor)}</div></div>
        <div class="ed-finance-card"><div class="ed-finance-card-label">Total Expenses</div><div class="ed-finance-card-value">${fmt(totalExpenses)}</div></div>
        <div class="ed-finance-card ed-finance-card--total"><div class="ed-finance-card-label">Grand Total Cost</div><div class="ed-finance-card-value">${fmt(grandTotal)}</div></div>
        ${totalRevenue > 0 ? `<div class="ed-finance-card ${profitCls}"><div class="ed-finance-card-label">Profit / Loss</div><div class="ed-finance-card-value">${profitTotal >= 0 ? "+" : ""}${fmt(profitTotal)}</div></div>` : ""}
      </div>
      <div class="ed-finance-section">
        <h4 class="ed-finance-section-title">Breakdown by Event</h4>
        <table class="ed-worker-table">
          <thead><tr><th>Event</th><th>Budget</th><th>Revenue</th><th>Labor</th><th>Expenses</th><th>Total Cost</th><th>P/L</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr>
            <td><strong>Total</strong></td>
            <td>${totalPlanned  > 0 ? fmt(totalPlanned)  : "—"}</td>
            <td>${totalRevenue  > 0 ? fmt(totalRevenue)  : "—"}</td>
            <td>${fmt(totalLabor)}</td>
            <td>${fmt(totalExpenses)}</td>
            <td><strong>${fmt(grandTotal)}</strong></td>
            <td class="${profitCls}">${totalRevenue > 0 ? `${profitTotal >= 0 ? "+" : ""}${fmt(profitTotal)}` : "—"}</td>
          </tr></tfoot>
        </table>
      </div>`;
  } catch {
    root.innerHTML = '<div class="pd-loading">Failed to load finance data.</div>';
  }
}

// ── BRIEFS TAB ───────────────────────────────────────────────────────────────

async function renderBriefTab() {
  const list = document.getElementById("pd-brief-list");
  if (!list || !currentProjectDetail) return;

  if (_pdBriefsData !== null) {
    list.innerHTML = _pdBriefsData.length === 0 ? briefEmptyStateHtml() : "";
    _pdBriefsData.forEach((b) => list.appendChild(buildBriefRow(b)));
    return;
  }

  list.innerHTML = '<div class="pd-loading">Loading briefs…</div>';
  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/projects/${encodeURIComponent(currentProjectDetail.projId)}/briefs`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error();
    _pdBriefsData = await res.json();
    list.innerHTML = _pdBriefsData.length === 0 ? briefEmptyStateHtml() : "";
    _pdBriefsData.forEach((b) => list.appendChild(buildBriefRow(b)));
  } catch {
    list.innerHTML = '<div class="pd-loading">Failed to load briefs.</div>';
  }
}

function buildBriefRow(brief) {
  const row = document.createElement("div");
  row.className = "pd-brief-row";
  row.dataset.briefId = brief.briefId;

  const authorName = brief.createdByManagerName ?? "Unknown";
  const dateStr = brief.createdAt ? formatBriefDate(brief.createdAt) : "";
  const preview =
    brief.content.length > 120
      ? brief.content.slice(0, 120) + "…"
      : brief.content;

  row.innerHTML = `
    <div class="pd-row-summary">
      <div class="pd-brief-summary">
        <span class="pd-brief-title-text">${escapeHtml(brief.title)}</span>
        <span class="pd-brief-preview-text">${escapeHtml(preview)}</span>
        <span class="pd-brief-author-text">Created by: ${escapeHtml(authorName)}${dateStr ? ` · ${dateStr}` : ""}</span>
      </div>
      <button class="pd-row-delete-btn" title="Delete brief" aria-label="Delete brief">&#10005;</button>
    </div>
    <div class="pd-row-form">
      <label class="pd-field-label">Title</label>
      <input type="text" class="pd-form-input" name="title" value="${escapeHtml(brief.title)}" placeholder="Brief title…" maxlength="200">
      <label class="pd-field-label">Content</label>
      <textarea class="pd-form-textarea pd-form-textarea--large" name="content" rows="5" placeholder="Brief content…" maxlength="5000">${escapeHtml(brief.content)}</textarea>
      <div class="pd-form-actions">
        <button class="pd-form-save-btn" disabled>Save</button>
        <button class="pd-form-cancel-btn">Cancel</button>
      </div>
    </div>`;
  wireBriefRow(row, brief);
  return row;
}

function wireBriefRow(row, brief) {
  const summary = row.querySelector(".pd-row-summary");
  const form = row.querySelector(".pd-row-form");
  const titleIn = row.querySelector('input[name="title"]');
  const contentIn = row.querySelector('textarea[name="content"]');
  const saveBtn = row.querySelector(".pd-form-save-btn");
  const cancelBtn = row.querySelector(".pd-form-cancel-btn");
  const deleteBtn = row.querySelector(".pd-row-delete-btn");

  summary.addEventListener("click", (e) => {
    if (e.target === deleteBtn || deleteBtn.contains(e.target)) return;
    if (row.classList.contains("pd-row--deleting")) return;
    if (_expandedRow === row) {
      collapseRow(row);
      return;
    }
    if (_expandedRow) collapseRow(_expandedRow);
    _expandedRow = row;
    form.classList.add("expanded");
    row.classList.add("pd-row--expanded");
  });

  const isDirty = () =>
    titleIn.value.trim() !== brief.title ||
    contentIn.value.trim() !== brief.content;

  [titleIn, contentIn].forEach((el) =>
    el.addEventListener("input", () => {
      saveBtn.disabled = !isDirty();
    }),
  );

  cancelBtn.addEventListener("click", () => collapseRow(row));

  saveBtn.addEventListener("click", async () => {
    if (!isDirty()) return;
    const title = titleIn.value.trim();
    const content = contentIn.value.trim();
    if (!title || !content) {
      if (!title) titleIn.focus();
      else contentIn.focus();
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE}/projects/${encodeURIComponent(currentProjectDetail.projId)}/briefs/${encodeURIComponent(brief.briefId)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title, content }),
        },
      );
      if (!res.ok) throw new Error();
      const updated = await res.json();
      const idx = _pdBriefsData.findIndex((b) => b.briefId === brief.briefId);
      if (idx !== -1) _pdBriefsData[idx] = updated;
      brief.title = updated.title;
      brief.content = updated.content;

      // Update summary in-place
      row.querySelector(".pd-brief-title-text").textContent = updated.title;
      const preview =
        updated.content.length > 120
          ? updated.content.slice(0, 120) + "…"
          : updated.content;
      row.querySelector(".pd-brief-preview-text").textContent = preview;

      collapseRow(row);
    } catch {
      saveBtn.textContent = "Save";
      saveBtn.disabled = false;
    }
  });

  wireBriefDeleteBtn(row, deleteBtn, brief);
}

function wireBriefDeleteBtn(row, deleteBtn, brief) {
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (row.classList.contains("pd-row--deleting")) return;

    if (_expandedRow && _expandedRow !== row) collapseRow(_expandedRow);
    if (_expandedRow === row) collapseRow(row);

    row.classList.add("pd-row--deleting");

    const confirm = document.createElement("div");
    confirm.className = "pd-delete-confirm";
    confirm.innerHTML = `<span>Delete this brief?</span>
      <button class="btn-confirm-yes">Delete</button>
      <button class="btn-confirm-no">Cancel</button>`;
    row.querySelector(".pd-row-summary").appendChild(confirm);

    confirm.querySelector(".btn-confirm-no").addEventListener("click", (e) => {
      e.stopPropagation();
      row.classList.remove("pd-row--deleting");
      confirm.remove();
    });

    confirm
      .querySelector(".btn-confirm-yes")
      .addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          const token = await getToken();
          const res = await fetch(
            `${API_BASE}/projects/${encodeURIComponent(currentProjectDetail.projId)}/briefs/${encodeURIComponent(brief.briefId)}`,
            { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
          );
          if (!res.ok) throw new Error();
          _pdBriefsData = _pdBriefsData.filter(
            (b) => b.briefId !== brief.briefId,
          );
          if (_expandedRow === row) _expandedRow = null;
          row.remove();
          const list = document.getElementById("pd-brief-list");
          if (list && _pdBriefsData.length === 0)
            list.innerHTML = briefEmptyStateHtml();
        } catch {
          row.classList.remove("pd-row--deleting");
          confirm.remove();
        }
      });
  });
}

function briefEmptyStateHtml() {
  return '<div class="pd-empty-state">No briefs yet. Start by adding your first brief.</div>';
}

function formatBriefDate(isoString) {
  if (!isoString) return "";
  try {
    return new Date(isoString).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function addNewBriefRow() {
  const list = document.getElementById("pd-brief-list");
  if (!list) return;
  if (list.querySelector('[data-new="true"]')) return;

  const tempBrief = {
    briefId: "",
    title: "",
    content: "",
    createdAt: null,
    createdByManagerName: null,
  };
  const row = buildBriefRow(tempBrief);
  row.dataset.new = "true";

  const form = row.querySelector(".pd-row-form");
  const titleIn = row.querySelector('input[name="title"]');
  const contentIn = row.querySelector('textarea[name="content"]');
  const saveBtn = row.querySelector(".pd-form-save-btn");
  const cancelBtn = row.querySelector(".pd-form-cancel-btn");

  cancelBtn.addEventListener("click", () => {
    if (_expandedRow === row) _expandedRow = null;
    row.remove();
    if (_pdBriefsData !== null && _pdBriefsData.length === 0) {
      list.innerHTML = briefEmptyStateHtml();
    }
  });

  // Replace wired save from buildBriefRow with CREATE handler
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.replaceWith(newSaveBtn);
  newSaveBtn.disabled = true;
  const canSave = () =>
    titleIn.value.trim() !== "" && contentIn.value.trim() !== "";
  [titleIn, contentIn].forEach((el) =>
    el.addEventListener("input", () => {
      newSaveBtn.disabled = !canSave();
    }),
  );

  newSaveBtn.addEventListener("click", async () => {
    const title = titleIn.value.trim();
    const content = contentIn.value.trim();
    if (!title || !content) {
      if (!title) titleIn.focus();
      else contentIn.focus();
      return;
    }

    newSaveBtn.disabled = true;
    newSaveBtn.textContent = "Saving…";
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE}/projects/${encodeURIComponent(currentProjectDetail.projId)}/briefs`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title, content }),
        },
      );
      if (!res.ok) throw new Error();
      const created = await res.json();
      if (_pdBriefsData === null) _pdBriefsData = [];
      _pdBriefsData.push(created);

      const emptyEl = list.querySelector(".pd-empty-state");
      if (emptyEl) emptyEl.remove();

      if (_expandedRow === row) _expandedRow = null;
      row.remove();
      const realRow = buildBriefRow(created);
      list.appendChild(realRow);
    } catch {
      newSaveBtn.textContent = "Save";
      newSaveBtn.disabled = false;
    }
  });

  if (_expandedRow) collapseRow(_expandedRow);

  const emptyEl = list.querySelector(".pd-empty-state");
  if (emptyEl) emptyEl.remove();

  list.prepend(row);
  _expandedRow = row;
  requestAnimationFrame(() => {
    form.classList.add("expanded");
    row.classList.add("pd-row--expanded");
    titleIn.focus();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ── CUSTOMER STATE ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

let editingCustomerId = null;
let viewingCustomerId = null;
let editingContactId = null;
let custDocumentFiles = [];
let inlineViewContainer = null; // active inline expanded customer cell
let pendingDeleteCustomerId = null;
let pendingDeleteContactId = null;
let pendingDeleteContactCustId = null;

// ═══════════════════════════════════════════════════════════════════════════
// ── CUSTOMER LIST ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

async function loadCustomers() {
  const tbody = document.getElementById("customer-tbody");
  tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Loading…</td></tr>`;
  try {
    const token = await getToken();
    console.log(
      "[loadCustomers] token:",
      token ? token.substring(0, 30) + "..." : "NULL/UNDEFINED",
    );
    const res = await fetch(`${API_BASE}/customers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("[loadCustomers] status:", res.status);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[loadCustomers] error response:", err);
      throw new Error();
    }
    allCustomers = await res.json();
    renderCustomers(filterCustomers(allCustomers));
  } catch (e) {
    console.error("[loadCustomers] caught:", e);
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:#ef4444">Failed to load customers.</td></tr>`;
  }
}

function renderCustomers(customers) {
  // Clear inline view state — tbody is being replaced
  viewingCustomerId = null;
  inlineViewContainer = null;
  const tbody = document.getElementById("customer-tbody");
  if (!customers.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No customers yet. Click "+ Add Customer" to get started.</td></tr>`;
    return;
  }
  tbody.innerHTML = customers
    .map(
      (c) => `
    <tr>
      <td><strong>${escape(c.customerCompanyName)}</strong></td>
      <td>${escape(c.companyPhone || "—")}</td>
      <td>${escape(c.companyEmail || "—")}</td>
      <td>${escape(c.companyCity || "—")}</td>
      <td>${escape(c.businessNumber || "—")}</td>
      <td>${c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"}</td>
      <td>
        <div class="actions-cell">
          <button class="btn-chevron"
            data-cust-action="toggle" data-id="${c.customerId}"
            title="Toggle details">▾</button>
          <button class="btn-action btn-action-edit"
            data-cust-action="edit" data-id="${c.customerId}">Edit</button>
          <button class="btn-action btn-action-delete"
            data-cust-action="delete" data-id="${c.customerId}"
            data-name="${escape(c.customerCompanyName)}">Delete</button>
        </div>
      </td>
    </tr>
  `,
    )
    .join("");
}

document
  .getElementById("customer-tbody")
  .addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-cust-action]");
    if (!btn) return;
    const action = btn.dataset.custAction;
    const id = btn.dataset.id;
    if (action === "toggle")
      await toggleCustomerRow(e.target.closest("tr"), id, btn);
    else if (action === "edit") await openCustomerFormModal(id);
    else if (action === "delete") openCustomerDeleteModal(id, btn.dataset.name);
  });

// ── Customer expandable row ────────────────────────────────────────────────
async function toggleCustomerRow(dataRow, customerId, chevronBtn) {
  const isCurrentlyExpanded = chevronBtn.classList.contains("expanded");

  // Collapse any open customer expanded row and clear inline state
  document.querySelectorAll("#customer-tbody tr.expanded-row").forEach((r) => {
    r.previousElementSibling
      ?.querySelector(".btn-chevron")
      ?.classList.remove("expanded");
    r.remove();
  });
  viewingCustomerId = null;
  inlineViewContainer = null;

  if (isCurrentlyExpanded) return; // was open → now collapsed, done

  chevronBtn.classList.add("expanded");
  const expRow = document.createElement("tr");
  expRow.className = "expanded-row";
  expRow.innerHTML = `<td colspan="7"><div class="expanded-row-inner"><div class="empty-state">Loading…</div></div></td>`;
  dataRow.after(expRow);

  const container = expRow.querySelector(".expanded-row-inner");
  viewingCustomerId = customerId;
  inlineViewContainer = container;

  await refreshCustomerView(customerId);
}

// ═══════════════════════════════════════════════════════════════════════════
// ── CUSTOMER FORM MODAL (Add / Edit) ───────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

document
  .getElementById("btn-add-customer")
  .addEventListener("click", () => openCustomerFormModal(null));
document
  .getElementById("customer-form-close")
  .addEventListener("click", closeCustomerFormModal);
document
  .getElementById("customer-form-cancel")
  .addEventListener("click", closeCustomerFormModal);
document
  .getElementById("customer-form-overlay")
  .addEventListener("click", (e) => {
    if (e.target === document.getElementById("customer-form-overlay"))
      closeCustomerFormModal();
  });

function clearCustomerForm() {
  [
    "cust-name",
    "cust-phone",
    "cust-email",
    "cust-city",
    "cust-address",
    "cust-billing-email",
    "cust-business-number",
    "cust-payment-terms",
    "cust-notes",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  // Reset optional contact fields
  [
    "cust-ct-firstname",
    "cust-ct-lastname",
    "cust-ct-jobtitle",
    "cust-ct-phone",
    "cust-ct-email",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const ctPrimary = document.getElementById("cust-ct-primary");
  if (ctPrimary) ctPrimary.checked = false;
  // Reset optional docs
  custDocumentFiles = [];
  const custDocsList = document.getElementById("cust-docs-list");
  if (custDocsList) custDocsList.innerHTML = "";
  document.getElementById("cust-form-error").style.display = "none";
  document.getElementById("cust-form-success").style.display = "none";
  // Reset optional sections to collapsed state
  document
    .querySelectorAll(
      "#cust-contact-section .optional-section, #cust-docs-section .optional-section",
    )
    .forEach((s) => s.classList.add("collapsed"));
  editingCustomerId = null;
  document.getElementById("customer-form-title").textContent =
    "Add New Customer";
  const btn = document.getElementById("btn-save-customer");
  btn.innerHTML = `${_ICON.check} Save Customer`;
  btn.disabled = false;
}

async function openCustomerFormModal(customerId) {
  // Close view if open (same z-index layer)
  document.getElementById("customer-view-overlay").classList.remove("open");
  clearCustomerForm();
  document.getElementById("customer-form-overlay").classList.add("open");

  // Show optional contact + docs sections only in add mode
  const isAdd = !customerId;
  document.getElementById("cust-contact-section").style.display = isAdd
    ? "block"
    : "none";
  document.getElementById("cust-docs-section").style.display = isAdd
    ? "block"
    : "none";

  if (customerId) {
    editingCustomerId = customerId;
    document.getElementById("customer-form-title").textContent =
      "Edit Customer";
    const btn = document.getElementById("btn-save-customer");
    btn.textContent = "Loading…";
    btn.disabled = true;
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/customers/${customerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const c = await res.json();
      document.getElementById("cust-name").value = c.customerCompanyName || "";
      document.getElementById("cust-phone").value = c.companyPhone || "";
      document.getElementById("cust-email").value = c.companyEmail || "";
      document.getElementById("cust-city").value = c.companyCity || "";
      document.getElementById("cust-address").value = c.companyAddress || "";
      document.getElementById("cust-billing-email").value =
        c.billingEmail || "";
      document.getElementById("cust-business-number").value =
        c.businessNumber || "";
      document.getElementById("cust-payment-terms").value =
        c.paymentTerms || "";
      document.getElementById("cust-notes").value = c.notes || "";
    } catch {
      document.getElementById("cust-form-error").textContent =
        "Failed to load customer data.";
      document.getElementById("cust-form-error").style.display = "block";
    } finally {
      btn.innerHTML = `${_ICON.check} Save Changes`;
      btn.disabled = false;
    }
  }
}

function closeCustomerFormModal() {
  document.getElementById("customer-form-overlay").classList.remove("open");
  clearCustomerForm();
}

document
  .getElementById("btn-save-customer")
  .addEventListener("click", async () => {
    const name = document.getElementById("cust-name").value.trim();
    const phone = document.getElementById("cust-phone").value.trim();
    const email = document.getElementById("cust-email").value.trim();
    const city = document.getElementById("cust-city").value.trim();
    const address = document.getElementById("cust-address").value.trim();
    const billingEmail = document
      .getElementById("cust-billing-email")
      .value.trim();
    const businessNum = document
      .getElementById("cust-business-number")
      .value.trim();
    const paymentTerms = document
      .getElementById("cust-payment-terms")
      .value.trim();
    const notes = document.getElementById("cust-notes").value.trim();

    const errorEl = document.getElementById("cust-form-error");
    const successEl = document.getElementById("cust-form-success");
    errorEl.style.display = "none";
    successEl.style.display = "none";

    if (!name) {
      errorEl.textContent = "Company name is required.";
      errorEl.style.display = "block";
      return;
    }

    const incompleteCustDocs = custDocumentFiles.filter(
      (d) => d && (d.file || d.title) && !(d.file && d.title),
    );
    if (incompleteCustDocs.length > 0) {
      errorEl.textContent =
        "Please select a title and a file for every document row, or remove incomplete rows.";
      errorEl.style.display = "block";
      return;
    }

    const body = {
      customerCompanyName: name,
      companyPhone: phone || null,
      companyEmail: email || null,
      companyCity: city || null,
      companyAddress: address || null,
      billingEmail: billingEmail || null,
      businessNumber: businessNum || null,
      paymentTerms: paymentTerms || null,
      notes: notes || null,
    };

    const btn = document.getElementById("btn-save-customer");
    btn.disabled = true;
    btn.textContent = "Saving…";

    try {
      const token = await getToken();
      const url = editingCustomerId
        ? `${API_BASE}/customers/${editingCustomerId}`
        : `${API_BASE}/customers`;
      const method = editingCustomerId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        errorEl.textContent = data.error || "Failed to save customer.";
        errorEl.style.display = "block";
        return;
      }

      const postSaveWarnings = [];

      // ── If adding a new customer, optionally create contact + upload docs ──
      if (!editingCustomerId) {
        const newCustomerId = data.customerId;

        // 1. Create contact if first or last name is filled
        const ctFirst = document
          .getElementById("cust-ct-firstname")
          .value.trim();
        const ctLast = document.getElementById("cust-ct-lastname").value.trim();
        if (ctFirst || ctLast) {
          if (!ctFirst || !ctLast) {
            postSaveWarnings.push(
              "Contact skipped: both first and last name are required.",
            );
          } else {
            btn.textContent = "Creating contact…";
            const ctBody = {
              firstName: ctFirst,
              lastName: ctLast,
              phone:
                document.getElementById("cust-ct-phone").value.trim() || null,
              email:
                document.getElementById("cust-ct-email").value.trim() || null,
              jobTitle:
                document.getElementById("cust-ct-jobtitle").value.trim() ||
                null,
              isPrimary: document.getElementById("cust-ct-primary").checked,
              notes: null,
            };
            const ctRes = await fetch(
              `${API_BASE}/customers/${newCustomerId}/contacts`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(ctBody),
              },
            );
            if (!ctRes.ok) {
              const ctData = await ctRes.json();
              postSaveWarnings.push(
                ctData.error || "Failed to create contact.",
              );
            }
          }
        }

        // 2. Upload documents if any were added
        const validCustDocs = custDocumentFiles.filter(
          (d) => d && d.file && d.title,
        );
        if (validCustDocs.length > 0) {
          btn.textContent = "Uploading documents…";
          try {
            await uploadCustomerDocuments(newCustomerId, validCustDocs);
          } catch {
            postSaveWarnings.push("Some documents failed to upload.");
          }
        }
      }

      if (postSaveWarnings.length > 0) {
        successEl.textContent =
          (editingCustomerId ? "Customer updated." : `${name} added.`) +
          " Note: " +
          postSaveWarnings.join(" ");
      } else {
        successEl.textContent = editingCustomerId
          ? "Customer updated successfully."
          : `${name} added successfully.`;
      }
      successEl.style.display = "block";
      await loadCustomers();
      setTimeout(closeCustomerFormModal, 1800);
    } catch {
      errorEl.textContent = "Network error. Please check your connection.";
      errorEl.style.display = "block";
    } finally {
      btn.disabled = false;
      btn.textContent = editingCustomerId ? "Save Changes" : "Save Customer";
    }
  });

// ═══════════════════════════════════════════════════════════════════════════
// ── CUSTOMER VIEW MODAL ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const custViewOverlay = document.getElementById("customer-view-overlay");
document
  .getElementById("customer-view-close")
  .addEventListener("click", closeCustomerViewModal);
document
  .getElementById("customer-view-done")
  .addEventListener("click", closeCustomerViewModal);
custViewOverlay.addEventListener("click", (e) => {
  if (e.target === custViewOverlay) closeCustomerViewModal();
});

function closeCustomerViewModal() {
  custViewOverlay.classList.remove("open");
  viewingCustomerId = null;
}

async function openCustomerViewModal(customerId) {
  viewingCustomerId = customerId;
  const body = document.getElementById("customer-view-body");
  body.innerHTML = `<div class="empty-state">Loading…</div>`;
  custViewOverlay.classList.add("open");
  await refreshCustomerView(customerId);
}

async function refreshCustomerView(customerId) {
  const body =
    inlineViewContainer ?? document.getElementById("customer-view-body");
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/customers/${customerId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error();
    const c = await res.json();

    if (!inlineViewContainer) {
      document.getElementById("customer-view-title").textContent =
        c.customerCompanyName;
    }

    // Load Firebase files
    let files = [];
    try {
      const filesDir = ref(storage, `customers/${customerId}/files`);
      const filesItems = await listAll(filesDir);
      for (const item of filesItems.items) {
        const url = await getDownloadURL(item);
        files.push({ name: item.name, storagePath: item.fullPath, url });
      }
    } catch {
      /* no files folder yet */
    }

    // ── contacts table ──
    const contactsHtml =
      c.contacts && c.contacts.length
        ? `<div class="contacts-table-wrap">
          <table class="contacts-table">
            <thead><tr>
              <th>Name</th><th>Job Title</th><th>Phone</th><th>Email</th><th>Primary</th><th>Actions</th>
            </tr></thead>
            <tbody>
              ${c.contacts
                .map(
                  (ct) => `
                <tr>
                  <td><strong>${escape(ct.firstName)} ${escape(ct.lastName)}</strong></td>
                  <td>${escape(ct.jobTitle || "—")}</td>
                  <td>${escape(ct.phone || "—")}</td>
                  <td>${escape(ct.email || "—")}</td>
                  <td>${
                    ct.isPrimary
                      ? '<span class="badge badge-active">Primary</span>'
                      : '<span style="color:#9ca3af;font-size:12px">—</span>'
                  }</td>
                  <td>
                    <div class="actions-cell">
                      <button class="btn-action btn-action-edit"
                        data-caction="edit" data-cid="${ct.contactId}">Edit</button>
                      <button class="btn-action btn-action-delete"
                        data-caction="delete" data-cid="${ct.contactId}"
                        data-cname="${escape(ct.firstName + " " + ct.lastName)}">Delete</button>
                    </div>
                  </td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>`
        : `<div class="empty-state-cta">
          <span class="empty-state-icon">👤</span>
          <p class="empty-state-title">No contacts yet</p>
          <p class="empty-state-hint">Add contact persons for this customer — phone, email, job title and more.</p>
          <button class="btn-empty-cta" id="btn-add-contact-empty">+ Add First Contact</button>
        </div>`;

    // ── files list ──
    const filesHtml = files.length
      ? `<div class="documents-list">
          ${files
            .map(
              (f) => `
            <div class="doc-item-existing">
              <span class="doc-item-name" title="${escape(f.name)}">${escape(f.name)}</span>
              <a href="${f.url}" target="_blank" rel="noopener" class="btn-open-doc">Open</a>
              <button type="button" class="btn-remove-doc"
                data-fpath="${f.storagePath}" title="Delete file">✕</button>
            </div>`,
            )
            .join("")}
        </div>`
      : `<div class="empty-state-cta">
          <span class="empty-state-icon">📁</span>
          <p class="empty-state-title">No files uploaded</p>
          <p class="empty-state-hint">Upload contracts, quotes or any relevant documents for this customer.</p>
          <button class="btn-empty-cta" id="btn-upload-cust-empty">+ Upload First File</button>
        </div>`;

    body.innerHTML = `
      <div class="view-info-grid" style="grid-template-columns:repeat(3,1fr)">
        ${viewField("Phone", c.companyPhone)}
        ${viewField("Email", c.companyEmail)}
        ${viewField("City", c.companyCity)}
        ${viewField("Address", c.companyAddress)}
        ${viewField("Billing Email", c.billingEmail)}
        ${viewField("Business #", c.businessNumber)}
        ${viewField("Payment Terms", c.paymentTerms)}
        ${viewField("Added", c.createdAt ? new Date(c.createdAt).toLocaleDateString() : null)}
      </div>
      ${
        c.notes
          ? `<div class="view-info-item" style="margin-top:4px">
        <label>Notes</label>
        <span style="white-space:pre-wrap;font-size:14px;font-weight:400;color:var(--text)">${escape(c.notes)}</span>
      </div>`
          : ""
      }

      <div class="view-section-divider"></div>

      <div>
        <div class="cview-section-header">
          <p class="view-section-title" style="margin-bottom:0">Contact Persons</p>
          <button class="btn-add-role" id="btn-add-contact-in-view">+ Add Contact</button>
        </div>
        <div style="margin-top:10px">${contactsHtml}</div>
      </div>

      <div class="view-section-divider"></div>

      <div>
        <div class="cview-section-header">
          <p class="view-section-title" style="margin-bottom:0">Files & Documents</p>
          <button class="btn-add-role" id="btn-upload-cust-file">+ Upload File</button>
        </div>
        <input type="file" id="cust-file-input-view"
          accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx" hidden />
        <div id="cust-files-view-list" style="margin-top:10px">${filesHtml}</div>
      </div>
    `;

    // Wire — Add Contact (header button + empty-state CTA)
    document
      .getElementById("btn-add-contact-in-view")
      .addEventListener("click", () => openContactFormModal(customerId, null));
    document
      .getElementById("btn-add-contact-empty")
      ?.addEventListener("click", () => openContactFormModal(customerId, null));

    // Wire — Upload File (header button + empty-state CTA)
    const triggerUpload = () =>
      document.getElementById("cust-file-input-view").click();
    document
      .getElementById("btn-upload-cust-file")
      .addEventListener("click", triggerUpload);
    document
      .getElementById("btn-upload-cust-empty")
      ?.addEventListener("click", triggerUpload);

    document
      .getElementById("cust-file-input-view")
      .addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 15 * 1024 * 1024) {
          alert("File must be under 15 MB.");
          e.target.value = "";
          return;
        }
        const uploadBtn = document.getElementById("btn-upload-cust-file");
        uploadBtn.disabled = true;
        uploadBtn.textContent = "Uploading…";
        try {
          const safeName = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
          const storageRef = ref(
            storage,
            `customers/${customerId}/files/${safeName}`,
          );
          await uploadBytes(storageRef, file);
          await refreshCustomerView(customerId);
        } catch {
          alert("Upload failed. Please try again.");
        } finally {
          e.target.value = "";
        }
      });

    // Wire — Delete file buttons
    body.querySelectorAll("[data-fpath]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this file? This cannot be undone.")) return;
        try {
          await deleteObject(ref(storage, btn.dataset.fpath));
          await refreshCustomerView(customerId);
        } catch {
          alert("Failed to delete file.");
        }
      });
    });

    // Wire — Contact action buttons
    body.querySelectorAll("[data-caction]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const caction = btn.dataset.caction;
        const cid = btn.dataset.cid;
        if (caction === "view") await openContactViewModal(customerId, cid);
        else if (caction === "edit")
          await openContactFormModal(customerId, cid);
        else if (caction === "delete")
          openContactDeleteModal(cid, btn.dataset.cname, customerId);
      });
    });
  } catch {
    body.innerHTML = `<div class="empty-state" style="color:#ef4444">Failed to load customer details.</div>`;
  }
}

function viewField(label, value) {
  return `<div class="view-info-item">
    <label>${label}</label>
    <span>${escape(value || "—")}</span>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ── CUSTOMER DELETE MODAL ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const custDeleteOverlay = document.getElementById("customer-delete-overlay");
document
  .getElementById("customer-delete-close")
  .addEventListener("click", closeCustomerDeleteModal);
document
  .getElementById("customer-delete-cancel")
  .addEventListener("click", closeCustomerDeleteModal);
custDeleteOverlay.addEventListener("click", (e) => {
  if (e.target === custDeleteOverlay) closeCustomerDeleteModal();
});

function openCustomerDeleteModal(customerId, name) {
  pendingDeleteCustomerId = customerId;
  document.getElementById("customer-delete-text").textContent =
    `Are you sure you want to permanently delete "${name}"?`;
  custDeleteOverlay.classList.add("open");
}

function closeCustomerDeleteModal() {
  custDeleteOverlay.classList.remove("open");
  pendingDeleteCustomerId = null;
}

document
  .getElementById("btn-confirm-customer-delete")
  .addEventListener("click", async () => {
    if (!pendingDeleteCustomerId) return;
    const btn = document.getElementById("btn-confirm-customer-delete");
    btn.disabled = true;
    btn.textContent = "Deleting…";
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE}/customers/${pendingDeleteCustomerId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "Failed to delete.");
        return;
      }
      try {
        await deleteCustomerStorageFiles(pendingDeleteCustomerId);
      } catch {
        /* best effort */
      }
      closeCustomerDeleteModal();
      await loadCustomers();
    } catch {
      alert("Network error. Could not delete customer.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Delete Customer";
    }
  });

async function deleteCustomerStorageFiles(customerId) {
  try {
    const items = await listAll(ref(storage, `customers/${customerId}/files`));
    await Promise.all(items.items.map((item) => deleteObject(item)));
  } catch {
    /* no files folder */
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ── CONTACT FORM MODAL (Add / Edit) — z-index 200 ─────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const contactFormOverlay = document.getElementById("contact-form-overlay");
document
  .getElementById("contact-form-close")
  .addEventListener("click", closeContactFormModal);
document
  .getElementById("contact-form-cancel")
  .addEventListener("click", closeContactFormModal);
contactFormOverlay.addEventListener("click", (e) => {
  if (e.target === contactFormOverlay) closeContactFormModal();
});

function clearContactForm() {
  [
    "ct-firstname",
    "ct-lastname",
    "ct-phone",
    "ct-email",
    "ct-jobtitle",
    "ct-notes",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("ct-primary").checked = false;
  document.getElementById("ct-form-error").style.display = "none";
  document.getElementById("ct-form-success").style.display = "none";
  editingContactId = null;
  document.getElementById("contact-form-title").textContent =
    "Add Contact Person";
  const btn = document.getElementById("btn-save-contact");
  btn.innerHTML = `${_ICON.check} Save Contact`;
  btn.disabled = false;
  delete btn.dataset.customerId;
}

async function openContactFormModal(customerId, contactId) {
  clearContactForm();
  editingContactId = contactId;
  document.getElementById("btn-save-contact").dataset.customerId = customerId;

  if (contactId) {
    document.getElementById("contact-form-title").textContent = "Edit Contact";
    const btn = document.getElementById("btn-save-contact");
    btn.textContent = "Loading…";
    btn.disabled = true;
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE}/customers/${customerId}/contacts/${contactId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) throw new Error();
      const ct = await res.json();
      document.getElementById("ct-firstname").value = ct.firstName || "";
      document.getElementById("ct-lastname").value = ct.lastName || "";
      document.getElementById("ct-phone").value = ct.phone || "";
      document.getElementById("ct-email").value = ct.email || "";
      document.getElementById("ct-jobtitle").value = ct.jobTitle || "";
      document.getElementById("ct-primary").checked = ct.isPrimary;
      document.getElementById("ct-notes").value = ct.notes || "";
    } catch {
      document.getElementById("ct-form-error").textContent =
        "Failed to load contact data.";
      document.getElementById("ct-form-error").style.display = "block";
    } finally {
      btn.innerHTML = `${_ICON.check} Save Changes`;
      btn.disabled = false;
    }
  }
  contactFormOverlay.classList.add("open");
}

function closeContactFormModal() {
  contactFormOverlay.classList.remove("open");
  clearContactForm();
}

document
  .getElementById("btn-save-contact")
  .addEventListener("click", async () => {
    const customerId =
      document.getElementById("btn-save-contact").dataset.customerId;
    const firstName = document.getElementById("ct-firstname").value.trim();
    const lastName = document.getElementById("ct-lastname").value.trim();
    const phone = document.getElementById("ct-phone").value.trim();
    const email = document.getElementById("ct-email").value.trim();
    const jobTitle = document.getElementById("ct-jobtitle").value.trim();
    const isPrimary = document.getElementById("ct-primary").checked;
    const notes = document.getElementById("ct-notes").value.trim();

    const errorEl = document.getElementById("ct-form-error");
    const successEl = document.getElementById("ct-form-success");
    errorEl.style.display = "none";
    successEl.style.display = "none";

    if (!firstName || !lastName) {
      errorEl.textContent = "First and last name are required.";
      errorEl.style.display = "block";
      return;
    }

    const body = {
      firstName,
      lastName,
      phone: phone || null,
      email: email || null,
      jobTitle: jobTitle || null,
      isPrimary,
      notes: notes || null,
    };

    const btn = document.getElementById("btn-save-contact");
    btn.disabled = true;
    btn.textContent = "Saving…";

    try {
      const token = await getToken();
      const url = editingContactId
        ? `${API_BASE}/customers/${customerId}/contacts/${editingContactId}`
        : `${API_BASE}/customers/${customerId}/contacts`;
      const method = editingContactId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        errorEl.textContent = data.error || "Failed to save contact.";
        errorEl.style.display = "block";
        return;
      }
      successEl.textContent = editingContactId
        ? "Contact updated successfully."
        : `${firstName} ${lastName} added.`;
      successEl.style.display = "block";
      setTimeout(() => {
        closeContactFormModal();
        if (viewingCustomerId) refreshCustomerView(viewingCustomerId);
      }, 1200);
    } catch {
      errorEl.textContent = "Network error. Please check your connection.";
      errorEl.style.display = "block";
    } finally {
      btn.disabled = false;
      btn.textContent = editingContactId ? "Save Changes" : "Save Contact";
    }
  });

// ═══════════════════════════════════════════════════════════════════════════
// ── CONTACT VIEW MODAL — z-index 200 ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const contactViewOverlay = document.getElementById("contact-view-overlay");
document
  .getElementById("contact-view-close")
  .addEventListener("click", closeContactViewModal);
document
  .getElementById("contact-view-done")
  .addEventListener("click", closeContactViewModal);
contactViewOverlay.addEventListener("click", (e) => {
  if (e.target === contactViewOverlay) closeContactViewModal();
});

function closeContactViewModal() {
  contactViewOverlay.classList.remove("open");
}

async function openContactViewModal(customerId, contactId) {
  const body = document.getElementById("contact-view-body");
  body.innerHTML = `<div class="empty-state">Loading…</div>`;
  contactViewOverlay.classList.add("open");
  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/customers/${customerId}/contacts/${contactId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) throw new Error();
    const ct = await res.json();
    const initials = (ct.firstName[0] + ct.lastName[0]).toUpperCase();
    body.innerHTML = `
      <div class="view-profile-section">
        <div class="view-profile-initials">${initials}</div>
        <span class="view-profile-name">${escape(ct.firstName)} ${escape(ct.lastName)}</span>
        ${ct.isPrimary ? '<span class="badge badge-active">Primary Contact</span>' : ""}
      </div>
      <div class="view-info-grid">
        ${viewField("Job Title", ct.jobTitle)}
        ${viewField("Phone", ct.phone)}
        ${viewField("Email", ct.email)}
        ${viewField("Added", ct.createdAt ? new Date(ct.createdAt).toLocaleDateString() : null)}
      </div>
      ${
        ct.notes
          ? `<div class="view-info-item">
        <label>Notes</label>
        <span style="white-space:pre-wrap;font-size:14px;font-weight:400">${escape(ct.notes)}</span>
      </div>`
          : ""
      }
    `;
  } catch {
    body.innerHTML = `<div class="empty-state" style="color:#ef4444">Failed to load contact details.</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ── CONTACT DELETE MODAL — z-index 200 ────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const contactDeleteOverlay = document.getElementById("contact-delete-overlay");
document
  .getElementById("contact-delete-close")
  .addEventListener("click", closeContactDeleteModal);
document
  .getElementById("contact-delete-cancel")
  .addEventListener("click", closeContactDeleteModal);
contactDeleteOverlay.addEventListener("click", (e) => {
  if (e.target === contactDeleteOverlay) closeContactDeleteModal();
});

function openContactDeleteModal(contactId, name, customerId) {
  pendingDeleteContactId = contactId;
  pendingDeleteContactCustId = customerId;
  document.getElementById("contact-delete-text").textContent =
    `Are you sure you want to delete contact "${name}"?`;
  contactDeleteOverlay.classList.add("open");
}

function closeContactDeleteModal() {
  contactDeleteOverlay.classList.remove("open");
  pendingDeleteContactId = null;
  pendingDeleteContactCustId = null;
}

document
  .getElementById("btn-confirm-contact-delete")
  .addEventListener("click", async () => {
    if (!pendingDeleteContactId) return;
    const btn = document.getElementById("btn-confirm-contact-delete");
    btn.disabled = true;
    btn.textContent = "Deleting…";
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE}/customers/${pendingDeleteContactCustId}/contacts/${pendingDeleteContactId}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "Failed to delete contact.");
        return;
      }
      closeContactDeleteModal();
      if (viewingCustomerId) await refreshCustomerView(viewingCustomerId);
    } catch {
      alert("Network error. Could not delete contact.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Delete Contact";
    }
  });

// ═══════════════════════════════════════════════════════════════════════════
// ── CREATE PROJECT FORM ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

let projectEventCounter = 0; // monotonic counter for unique event block IDs
let cachedRoles = []; // roles loaded once per session
let _projEndDateTouched = false; // true once the user manually changes End Date

// ── Project date DOM refs (static elements) ───────────────────────────────
const _projStartInput = document.getElementById("proj-start-date");
const _projEndInput = document.getElementById("proj-end-date");

// ── Revalidate every event-date field against the current project range ────
function revalidateEventDates() {
  const startDate = _projStartInput.value;
  const endDate = _projEndInput.value;

  // Project-level: mark End Date red if it precedes Start Date
  const projEndFieldEl = document.getElementById("field-proj-end");
  const projDatesInvalid = !!(startDate && endDate && endDate < startDate);
  projEndFieldEl?.classList.toggle("has-range-error", projDatesInvalid);

  document.querySelectorAll(".event-block").forEach((block) => {
    const idx = block.dataset.eventIdx;
    const dateInput = document.getElementById(`event-start-date-${idx}`);
    const fieldEl = block.querySelector(`[data-field="event-start-date-${idx}"]`);
    if (!dateInput || !fieldEl) return;
    const dateVal = dateInput.value;
    // Out-of-range only when all three dates are present
    const outOfRange = !!(
      dateVal &&
      startDate &&
      endDate &&
      (dateVal < startDate || dateVal > endDate)
    );
    fieldEl.classList.toggle("has-range-error", outOfRange);
  });
}

// ── Project Start Date change ─────────────────────────────────────────────
_projStartInput.addEventListener("change", () => {
  const startVal = _projStartInput.value;
  // Keep end-date's minimum in sync
  _projEndInput.min = startVal;
  // Auto-set End Date only if the user has never touched it
  if (startVal && !_projEndDateTouched) {
    _projEndInput.value = startVal;
  }
  // Auto-fill every untouched event date
  document.querySelectorAll(".event-block").forEach((block) => {
    const idx = block.dataset.eventIdx;
    const startDateInput = document.getElementById(`event-start-date-${idx}`);
    const endDateInput = document.getElementById(`event-end-date-${idx}`);
    if (startDateInput && !startDateInput.dataset.touched) {
      startDateInput.value = startVal;
      if (endDateInput && !endDateInput.dataset.touched) endDateInput.value = startVal;
      // Refresh the header summary for this block
      const nameVal =
        document.getElementById(`event-name-${idx}`)?.value.trim() || "";
      const summaryEl = document.getElementById(`event-summary-${idx}`);
      if (summaryEl) {
        const parts = [];
        if (nameVal) parts.push(nameVal);
        if (startVal) parts.push(startVal);
        summaryEl.textContent = parts.length ? ` · ${parts.join(" · ")}` : "";
      }
    }
  });
  revalidateEventDates();
});

// ── Project End Date change ───────────────────────────────────────────────
_projEndInput.addEventListener("change", () => {
  _projEndDateTouched = true;
  revalidateEventDates();
});

// ── Back button ────────────────────────────────────────────────────────────
document
  .getElementById("btn-back-to-projects")
  .addEventListener("click", () => {
    activateSection("projects");
  });

// ── Save Draft ──────────────────────────────────────────────────────────────
document
  .getElementById("btn-save-draft")
  .addEventListener("click", async () => {
    document
      .querySelectorAll(".field.has-error")
      .forEach((f) => f.classList.remove("has-error"));
    const errBanner = document.getElementById("create-project-error");
    errBanner.textContent = "";
    errBanner.classList.remove("visible");

    const name = document.getElementById("proj-name").value.trim();
    if (!name) {
      document.getElementById("field-proj-name").classList.add("has-error");
      errBanner.textContent = "Project name is required.";
      errBanner.classList.add("visible");
      return;
    }

    const startDate = document.getElementById("proj-start-date").value || null;
    const endDate = document.getElementById("proj-end-date").value || null;
    const customerId = document.getElementById("proj-customer").value || null;

    const btn = document.getElementById("btn-save-draft");
    btn.disabled = true;
    btn.textContent = "Saving…";

    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          startDate,
          endDate,
          customerId,
          status: "draft",
          events: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        errBanner.textContent = data.error || "Failed to save draft.";
        errBanner.classList.add("visible");
        return;
      }
      activateSection("projects");
    } catch {
      errBanner.textContent = "Network error. Please check your connection.";
      errBanner.classList.add("visible");
    } finally {
      btn.disabled = false;
      btn.textContent = "Save Draft";
    }
  });

// ── ＋ New Customer inside create-project form ─────────────────────────────
document
  .getElementById("btn-proj-new-customer")
  .addEventListener("click", () => {
    openCustomerFormModal(null);
  });

// ── ＋ Add Event button ────────────────────────────────────────────────────
document.getElementById("btn-add-event").addEventListener("click", () => {
  appendEventBlock();
});

// ── Collapse All / Expand All events ──────────────────────────────────────
document.getElementById("btn-collapse-events").addEventListener("click", () => {
  const blocks = document.querySelectorAll(".event-block");
  const anyExpanded = [...blocks].some(
    (b) => !b.classList.contains("collapsed"),
  );
  blocks.forEach((b) => b.classList.toggle("collapsed", anyExpanded));
  updateCollapseAllBtn();
});

// ── Initialise the form (called when navigating to create-project) ─────────
function initCreateProjectForm() {
  // Clear project-level fields
  document.getElementById("proj-name").value = "";
  _projStartInput.value = "";
  _projStartInput.max = "";
  _projEndInput.value = "";
  _projEndInput.min = "";
  _projEndDateTouched = false;
  document.getElementById("proj-customer").value = "";
  ["field-proj-name", "field-proj-start", "field-proj-end"].forEach((id) =>
    document.getElementById(id)?.classList.remove("has-error"),
  );

  // Clear error banner
  const errBanner = document.getElementById("create-project-error");
  errBanner.textContent = "";
  errBanner.classList.remove("visible");

  // Clear events container and render first event block
  projectEventCounter = 0;
  document.getElementById("events-container").innerHTML = "";
  appendEventBlock();
}

// ── Load customers into the project customer dropdown ──────────────────────
async function loadProjectCustomerDropdown() {
  const sel = document.getElementById("proj-customer");
  const current = sel.value;

  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/customers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const customers = await res.json();
    sel.innerHTML =
      `<option value="">— None —</option>` +
      customers
        .map(
          (c) =>
            `<option value="${c.customerId}">${escapeHtml(c.customerCompanyName)}</option>`,
        )
        .join("");
    if (current) sel.value = current;
  } catch {
    // silently ignore — dropdown just stays empty
  }
}

// ── Refresh customer dropdown and auto-select the newest entry ─────────────
// Called after a customer is created from inside the project form.
async function refreshProjectCustomerDropdownAndSelect(newId) {
  const sel = document.getElementById("proj-customer");
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/customers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const customers = await res.json();
    sel.innerHTML =
      `<option value="">— None —</option>` +
      customers
        .map(
          (c) =>
            `<option value="${c.customerId}">${escapeHtml(c.customerCompanyName)}</option>`,
        )
        .join("");
    if (newId) sel.value = newId;
  } catch {
    /* ignore */
  }
}

// Intercept customer save to refresh project dropdown if we're on create-project
const _origSaveCustBtn = document.getElementById("btn-save-customer");
_origSaveCustBtn.addEventListener("click", async () => {
  // We re-use the existing handler; hook into the modal close to refresh.
  // After a short delay (enough for the existing handler's setTimeout to fire),
  // refresh the dropdown if the create-project section is visible.
  setTimeout(async () => {
    const cpSection = document.getElementById("section-create-project");
    if (cpSection && cpSection.style.display !== "none") {
      // Find the newest customer (last in list) and auto-select it
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/customers`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const customers = await res.json();
        const sel = document.getElementById("proj-customer");
        sel.innerHTML =
          `<option value="">— None —</option>` +
          customers
            .map(
              (c) =>
                `<option value="${c.customerId}">${escapeHtml(c.customerCompanyName)}</option>`,
            )
            .join("");
        // Auto-select the last created customer (highest createdAt)
        const newest = customers.at(-1);
        if (newest) sel.value = newest.customerId;
      } catch {
        /* ignore */
      }
    }
  }, 2000);
});

// ── Load roles once and cache them ────────────────────────────────────────
async function ensureRolesLoaded() {
  if (cachedRoles.length > 0) return cachedRoles;
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/roles`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    cachedRoles = await res.json();
  } catch {
    /* ignore */
  }
  return cachedRoles;
}

// ── Append a new event block ───────────────────────────────────────────────
async function appendEventBlock() {
  const idx = ++projectEventCounter;
  const roles = await ensureRolesLoaded();

  const block = document.createElement("div");
  block.className = "event-block";
  block.dataset.eventIdx = idx;

  block.innerHTML = `
    <div class="event-block-header" data-toggle-event="${idx}">
      <div class="event-block-header-inner">
        <span class="event-block-chevron">▾</span>
        <span class="event-block-label">Event ${idx}</span>
        <span class="event-block-summary" id="event-summary-${idx}"></span>
      </div>
      <button class="btn-remove-block" type="button" title="Remove event" data-remove-event="${idx}" aria-label="Remove event">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="event-block-body">
      <div class="field" data-field="event-name-${idx}">
        <label>Event Name <span class="req">*</span></label>
        <input type="text" id="event-name-${idx}" placeholder="e.g. Cocktail Hour" autocomplete="off" />
      </div>
      <div class="form-row">
        <div class="field datetime-field" data-field="event-start-date-${idx}">
          <label>Start <span class="req">*</span></label>
          <div class="datetime-group">
            <input type="date" id="event-start-date-${idx}" class="dt-date" />
            <input type="time" id="event-start-time-${idx}" class="dt-time" step="300" />
          </div>
        </div>
        <div class="field datetime-field" data-field="event-end-date-${idx}">
          <label>End <span class="req">*</span></label>
          <div class="datetime-group">
            <input type="date" id="event-end-date-${idx}" class="dt-date" />
            <input type="time" id="event-end-time-${idx}" class="dt-time" step="300" />
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label>Location</label>
          <input type="text" id="event-location-${idx}" placeholder="e.g. Grand Ballroom" autocomplete="off" />
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label>Event Type</label>
          <select id="event-type-${idx}">
            <option value="">— Select type —</option>
            <option value="conference">Conference</option>
            <option value="party">Party</option>
            <option value="wedding">Wedding</option>
            <option value="corporate">Corporate</option>
            <option value="bar_mitzvah">Bar Mitzvah</option>
            <option value="birthday">Birthday</option>
            <option value="concert">Concert</option>
            <option value="exhibition">Exhibition</option>
            <option value="seminar">Seminar</option>
            <option value="gala">Gala</option>
            <option value="trip">Trip</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="field">
          <label>Attendees Count</label>
          <input type="number" id="event-attendees-${idx}" placeholder="0" min="0" />
        </div>
      </div>
      <div class="form-row">
        <div class="field">
          <label>Planned Budget</label>
          <input type="number" id="event-budget-${idx}" placeholder="0.00" min="0" step="0.01" />
        </div>
        <div class="field">
          <label>Expected Revenue</label>
          <input type="number" id="event-revenue-${idx}" placeholder="0.00" min="0" step="0.01" />
        </div>
      </div>

      <!-- Shifts sub-section -->
      <div class="shifts-subsection">
        <div class="shifts-subheader">
          <span class="shifts-subheader-label">Shifts</span>
          <button class="btn-add-shift btn-with-icon" type="button" data-add-shift="${idx}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Shift
          </button>
        </div>
        <div class="shifts-col-headers">
          <span>Role</span>
          <span>Qty</span>
          <span>Start (date &amp; time)</span>
          <span>End (date &amp; time)</span>
          <span></span>
        </div>
        <div class="shifts-list" id="shifts-list-${idx}">
          <!-- Shift rows injected by JS -->
        </div>
      </div>
    </div>
  `;

  document.getElementById("events-container").appendChild(block);
  lucide.createIcons(); // re-run so any new lucide icons render

  // Collapse all previous event blocks when a new one is added
  const allBlocks = document.querySelectorAll(".event-block");
  if (allBlocks.length > 1) {
    allBlocks.forEach((b, i) => {
      if (i < allBlocks.length - 1) b.classList.add("collapsed");
    });
    updateCollapseAllBtn();
  }

  // Toggle collapse on header click (excluding remove button)
  block
    .querySelector(`[data-toggle-event="${idx}"]`)
    .addEventListener("click", (e) => {
      if (e.target.closest(".btn-remove-block")) return;
      block.classList.toggle("collapsed");
      updateCollapseAllBtn();
    });

  // Remove event listener
  block
    .querySelector(`[data-remove-event="${idx}"]`)
    .addEventListener("click", () => {
      block.remove();
      renumberEventBlocks();
      updateCollapseAllBtn();
    });

  // Add shift listener
  block
    .querySelector(`[data-add-shift="${idx}"]`)
    .addEventListener("click", () => {
      appendShiftRow(idx, roles);
    });

  // Live summary: update header summary from name + start date inputs
  const updateSummary = () => {
    const nameVal =
      document.getElementById(`event-name-${idx}`)?.value.trim() || "";
    const dateVal = document.getElementById(`event-start-date-${idx}`)?.value || "";
    const summaryEl = document.getElementById(`event-summary-${idx}`);
    if (!summaryEl) return;
    const parts = [];
    if (nameVal) parts.push(nameVal);
    if (dateVal) parts.push(dateVal);
    summaryEl.textContent = parts.length ? ` · ${parts.join(" · ")}` : "";
  };
  block
    .querySelector(`#event-name-${idx}`)
    .addEventListener("input", updateSummary);
  // Event start date: update summary + mark touched + revalidate range
  block.querySelector(`#event-start-date-${idx}`).addEventListener("change", () => {
    document.getElementById(`event-start-date-${idx}`).dataset.touched = "1";
    updateSummary();
    revalidateEventDates();
  });

  // Default event start/end dates to project start date (if already chosen)
  const projStartVal = _projStartInput.value;
  if (projStartVal) {
    document.getElementById(`event-start-date-${idx}`).value = projStartVal;
    document.getElementById(`event-end-date-${idx}`).value = projStartVal;
    updateSummary();
  }

  // Revalidate so new block is checked immediately against current project range
  revalidateEventDates();

  // Render first shift row immediately
  appendShiftRow(idx, roles);
}

// ── Update the Collapse All / Expand All button label ─────────────────────
function updateCollapseAllBtn() {
  const btn = document.getElementById("btn-collapse-events");
  if (!btn) return;
  const blocks = document.querySelectorAll(".event-block");
  const anyExpanded = [...blocks].some(
    (b) => !b.classList.contains("collapsed"),
  );
  btn.textContent = anyExpanded ? "Collapse all" : "Expand all";
}

// ── Renumber event block labels after a removal ────────────────────────────
function renumberEventBlocks() {
  document.querySelectorAll(".event-block").forEach((block, i) => {
    const label = block.querySelector(".event-block-label");
    if (label) label.textContent = `Event ${i + 1}`;
  });
}

// ── Append a shift row inside a given event block ─────────────────────────
function appendShiftRow(eventIdx, roles) {
  const list = document.getElementById(`shifts-list-${eventIdx}`);
  if (!list) return;

  const roleOptions = roles.length
    ? roles
        .map(
          (r) =>
            `<option value="${r.rollId}">${escapeHtml(r.rollName)}</option>`,
        )
        .join("")
    : `<option value="">No roles available</option>`;

  const row = document.createElement("div");
  row.className = "shift-row";
  row.innerHTML = `
    <div class="field">
      <label>Role *</label>
      <select>
        <option value="">— Select role —</option>
        ${roleOptions}
      </select>
    </div>
    <div class="field">
      <label>Qty *</label>
      <input type="number" placeholder="1" min="1" value="1" />
    </div>
    <div class="field datetime-field">
      <label>Start *</label>
      <div class="datetime-group">
        <input type="date" class="dt-date shift-start-date" />
        <input type="time" class="dt-time shift-start-time" step="300" />
      </div>
    </div>
    <div class="field datetime-field">
      <label>End *</label>
      <div class="datetime-group">
        <input type="date" class="dt-date shift-end-date" />
        <input type="time" class="dt-time shift-end-time" step="300" />
      </div>
    </div>
    <button class="btn-remove-shift" type="button" title="Remove shift" aria-label="Remove shift">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  `;

  row
    .querySelector(".btn-remove-shift")
    .addEventListener("click", () => row.remove());

  list.appendChild(row);
}

// ── Collect all form data into a CreateProjectRequest object ──────────────
function collectProjectFormData() {
  const events = [];
  let valid = true;

  // Clear previous error highlights
  document
    .querySelectorAll(".field.has-error")
    .forEach((f) => f.classList.remove("has-error"));
  const errBanner = document.getElementById("create-project-error");
  errBanner.textContent = "";
  errBanner.classList.remove("visible");

  // Project-level fields
  const name = document.getElementById("proj-name").value.trim();
  const startDate = document.getElementById("proj-start-date").value;
  const endDate = document.getElementById("proj-end-date").value;
  const customer = document.getElementById("proj-customer").value || null;

  if (!name) {
    document.getElementById("field-proj-name").classList.add("has-error");
    valid = false;
  }
  if (!startDate) {
    document.getElementById("field-proj-start").classList.add("has-error");
    valid = false;
  }
  if (!endDate) {
    document.getElementById("field-proj-end").classList.add("has-error");
    valid = false;
  }
  if (startDate && endDate && endDate < startDate) {
    document.getElementById("field-proj-end").classList.add("has-error");
    errBanner.textContent = "End date cannot be before start date.";
    errBanner.classList.add("visible");
    valid = false;
  }

  const showError = (msg) => {
    if (!errBanner.classList.contains("visible")) {
      errBanner.textContent = msg;
      errBanner.classList.add("visible");
    }
    valid = false;
  };

  // Event blocks
  document.querySelectorAll(".event-block").forEach((block) => {
    const idx = block.dataset.eventIdx;

    const evtName =
      document.getElementById(`event-name-${idx}`)?.value.trim() || "";
    const evtStartDate = document.getElementById(`event-start-date-${idx}`)?.value || "";
    const evtStartTime = document.getElementById(`event-start-time-${idx}`)?.value || "";
    const evtEndDate = document.getElementById(`event-end-date-${idx}`)?.value || "";
    const evtEndTime = document.getElementById(`event-end-time-${idx}`)?.value || "";
    const location =
      document.getElementById(`event-location-${idx}`)?.value.trim() || null;
    const evtType = document.getElementById(`event-type-${idx}`)?.value || null;
    const attendees = document.getElementById(`event-attendees-${idx}`)?.value;
    const budget = document.getElementById(`event-budget-${idx}`)?.value;
    const revenue = document.getElementById(`event-revenue-${idx}`)?.value;

    if (!evtName) {
      block.querySelector(`[data-field="event-name-${idx}"]`)?.classList.add("has-error");
      valid = false;
    }
    if (!evtStartDate || !evtStartTime) {
      block.querySelector(`[data-field="event-start-date-${idx}"]`)?.classList.add("has-error");
      valid = false;
    }
    if (!evtEndDate || !evtEndTime) {
      block.querySelector(`[data-field="event-end-date-${idx}"]`)?.classList.add("has-error");
      valid = false;
    }

    // Combine date + time into Date objects for range checks
    const evtStartDT = evtStartDate && evtStartTime ? new Date(`${evtStartDate}T${evtStartTime}`) : null;
    const evtEndDT   = evtEndDate   && evtEndTime   ? new Date(`${evtEndDate}T${evtEndTime}`)     : null;

    if (evtStartDT && evtEndDT) {
      if (evtEndDT <= evtStartDT) {
        block.querySelector(`[data-field="event-end-date-${idx}"]`)?.classList.add("has-error");
        showError(`Event ${idx}: end must be after start.`);
      }
      if (startDate && evtStartDate < startDate) {
        block.querySelector(`[data-field="event-start-date-${idx}"]`)?.classList.add("has-error");
        showError(`Event ${idx}: start is before the project start date.`);
      }
      if (endDate && evtEndDate > endDate) {
        block.querySelector(`[data-field="event-end-date-${idx}"]`)?.classList.add("has-error");
        showError(`Event ${idx}: end is after the project end date.`);
      }
    }

    const startDateTime = evtStartDT ? evtStartDT.toISOString() : null;
    const endDateTime   = evtEndDT   ? evtEndDT.toISOString()   : null;

    // Collect shifts
    const shifts = [];
    block.querySelectorAll(".shift-row").forEach((row) => {
      const rollId = row.querySelector("select")?.value || "";
      const qty = parseInt(row.querySelector('input[type="number"]')?.value, 10) || 1;
      const shtStartDate = row.querySelector(".shift-start-date")?.value || "";
      const shtStartTime = row.querySelector(".shift-start-time")?.value || "";
      const shtEndDate = row.querySelector(".shift-end-date")?.value || "";
      const shtEndTime = row.querySelector(".shift-end-time")?.value || "";

      if (!rollId || !shtStartDate || !shtStartTime || !shtEndDate || !shtEndTime) {
        row.querySelector(".field")?.classList.add("has-error");
        valid = false;
      }

      const shtStartDT = shtStartDate && shtStartTime ? new Date(`${shtStartDate}T${shtStartTime}`) : null;
      const shtEndDT   = shtEndDate   && shtEndTime   ? new Date(`${shtEndDate}T${shtEndTime}`)     : null;

      if (shtStartDT && shtEndDT) {
        if (shtEndDT <= shtStartDT) {
          row.querySelector(".field")?.classList.add("has-error");
          showError(`A shift in event ${idx}: end must be after start.`);
        }
        if (evtStartDT && shtStartDT < evtStartDT) {
          row.querySelector(".field")?.classList.add("has-error");
          showError(`A shift in event ${idx}: starts before the event.`);
        }
        if (evtEndDT && shtEndDT > evtEndDT) {
          row.querySelector(".field")?.classList.add("has-error");
          showError(`A shift in event ${idx}: ends after the event.`);
        }
      }

      shifts.push({
        rollId,
        requiredQuantity: qty,
        startTime: shtStartDT ? shtStartDT.toISOString() : null,
        endTime:   shtEndDT   ? shtEndDT.toISOString()   : null,
      });
    });

    events.push({
      name: evtName,
      startTime: startDateTime,
      endTime: endDateTime,
      location: location || null,
      attendeesCount: attendees ? parseInt(attendees, 10) : null,
      eventType: evtType || null,
      plannedBudget: budget ? parseFloat(budget) : null,
      expectedRevenue: revenue ? parseFloat(revenue) : null,
      shifts,
    });
  });

  if (!valid) {
    if (!errBanner.classList.contains("visible")) {
      errBanner.textContent = "Please fill in all required fields.";
      errBanner.classList.add("visible");
    }
    return null;
  }

  return {
    name: name,
    startDate: startDate,
    endDate: endDate,
    customerId: customer,
    events,
  };
}

// ── Submit project ──────────────────────────────────────────────────────────
document
  .getElementById("btn-submit-project")
  .addEventListener("click", async () => {
    const body = collectProjectFormData();
    if (!body) return; // validation failed — errors already shown

    const btn = document.getElementById("btn-submit-project");
    btn.disabled = true;
    btn.textContent = "Saving…";

    const errBanner = document.getElementById("create-project-error");
    errBanner.classList.remove("visible");

    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...body, status: "planning" }),
      });
      const data = await res.json();
      if (!res.ok) {
        errBanner.textContent = data.error || "Failed to create project.";
        errBanner.classList.add("visible");
        return;
      }
      // Success — return to projects board
      activateSection("projects");
    } catch {
      errBanner.textContent = "Network error. Please check your connection.";
      errBanner.classList.add("visible");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `${_ICON.folder} Create Project`;
    }
  });

// ── HTML-escape helper (used in project form templates) ───────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ═══════════════════════════════════════════════════════════════════════════
// ── SHIFT EDIT / DELETE ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

let editingShiftId = null;
let deletingShiftId = null;

// ── Event delegation on gantt container ────────────────────────────────────
document.getElementById("gantt-container").addEventListener("click", (e) => {
  const editBtn = e.target.closest(".gantt-bar-btn-edit");
  const deleteBtn = e.target.closest(".gantt-bar-btn-delete");
  const addShiftBtn = e.target.closest(".btn-add-shift-gantt");
  if (editBtn) openShiftEditModal(editBtn);
  if (deleteBtn) openShiftDeleteModal(deleteBtn.dataset.shiftId);
  if (addShiftBtn)
    openShiftAddModal(
      addShiftBtn.dataset.eventId,
      addShiftBtn.dataset.eventDate,
    );
});

// ── Edit Modal ─────────────────────────────────────────────────────────────

async function openShiftEditModal(btn) {
  editingShiftId = btn.dataset.shiftId;
  const roleId = btn.dataset.roleId;
  const startVal = btn.dataset.start; // already YYYY-MM-DDTHH:MM
  const endVal = btn.dataset.end;
  const qty = btn.dataset.qty;

  // Reset error
  const errEl = document.getElementById("shift-edit-error");
  errEl.style.display = "none";
  errEl.textContent = "";

  // Pre-fill time + qty immediately
  document.getElementById("shift-edit-start").value = startVal;
  document.getElementById("shift-edit-end").value = endVal;
  document.getElementById("shift-edit-qty").value = qty;

  // Open modal
  document.getElementById("shift-edit-overlay").classList.add("open");

  // Load roles into dropdown
  const select = document.getElementById("shift-edit-role");
  select.innerHTML = '<option value="">Loading…</option>';
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/roles`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error();
    const roles = await res.json();
    select.innerHTML = roles
      .map(
        (r) =>
          `<option value="${escapeHtml(r.rollId)}" ${r.rollId === roleId ? "selected" : ""}>${escapeHtml(r.rollName)}</option>`,
      )
      .join("");
  } catch {
    select.innerHTML = '<option value="">Failed to load roles</option>';
  }
}

function closeShiftEditModal() {
  document.getElementById("shift-edit-overlay").classList.remove("open");
  editingShiftId = null;
}

document
  .getElementById("shift-edit-close")
  .addEventListener("click", closeShiftEditModal);
document
  .getElementById("shift-edit-cancel")
  .addEventListener("click", closeShiftEditModal);
document.getElementById("shift-edit-overlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("shift-edit-overlay"))
    closeShiftEditModal();
});

document
  .getElementById("btn-save-shift")
  .addEventListener("click", async () => {
    if (!editingShiftId) return;

    const rollId = document.getElementById("shift-edit-role").value;
    const start = document.getElementById("shift-edit-start").value;
    const end = document.getElementById("shift-edit-end").value;
    const qty = parseInt(document.getElementById("shift-edit-qty").value, 10);

    const errEl = document.getElementById("shift-edit-error");
    errEl.style.display = "none";

    if (!rollId) {
      errEl.textContent = "Please select a role.";
      errEl.style.display = "";
      return;
    }
    if (!start) {
      errEl.textContent = "Please enter a start time.";
      errEl.style.display = "";
      return;
    }
    if (!end) {
      errEl.textContent = "Please enter an end time.";
      errEl.style.display = "";
      return;
    }
    if (end <= start) {
      errEl.textContent = "End time must be after start time.";
      errEl.style.display = "";
      return;
    }
    if (!qty || qty < 1) {
      errEl.textContent = "Quantity must be at least 1.";
      errEl.style.display = "";
      return;
    }

    const btn = document.getElementById("btn-save-shift");
    btn.disabled = true;
    btn.textContent = "Saving…";

    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE}/shifts/${encodeURIComponent(editingShiftId)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rollId,
            startTime: start,
            endTime: end,
            requiredQuantity: qty,
          }),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        errEl.textContent = data.error || "Failed to save shift.";
        errEl.style.display = "";
        return;
      }

      closeShiftEditModal();
      if (currentProjectId) loadProjectSchedule(currentProjectId);
    } catch {
      errEl.textContent = "Network error. Please try again.";
      errEl.style.display = "";
    } finally {
      btn.disabled = false;
      btn.innerHTML = `${_ICON.check} Save Changes`;
    }
  });

// ── Delete Modal ───────────────────────────────────────────────────────────

function openShiftDeleteModal(shiftId) {
  deletingShiftId = shiftId;
  document.getElementById("shift-delete-overlay").classList.add("open");
}

function closeShiftDeleteModal() {
  document.getElementById("shift-delete-overlay").classList.remove("open");
  deletingShiftId = null;
}

document
  .getElementById("shift-delete-close")
  .addEventListener("click", closeShiftDeleteModal);
document
  .getElementById("shift-delete-cancel")
  .addEventListener("click", closeShiftDeleteModal);
document
  .getElementById("shift-delete-overlay")
  .addEventListener("click", (e) => {
    if (e.target === document.getElementById("shift-delete-overlay"))
      closeShiftDeleteModal();
  });

document
  .getElementById("btn-confirm-shift-delete")
  .addEventListener("click", async () => {
    if (!deletingShiftId) return;

    const btn = document.getElementById("btn-confirm-shift-delete");
    btn.disabled = true;
    btn.textContent = "Deleting…";

    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE}/shifts/${encodeURIComponent(deletingShiftId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete shift.");
        return;
      }

      closeShiftDeleteModal();
      if (currentProjectId) loadProjectSchedule(currentProjectId);
    } catch {
      alert("Network error. Please try again.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Delete";
    }
  });

// ── Add Shift Modal ─────────────────────────────────────────────────────────

let addingShiftEventId = null;
let addingShiftEventDate = null;

async function openShiftAddModal(eventId, eventDate) {
  addingShiftEventId = eventId;
  addingShiftEventDate = eventDate;

  const errEl = document.getElementById("shift-add-error");
  errEl.style.display = "none";
  errEl.textContent = "";

  document.getElementById("shift-add-start").value = "";
  document.getElementById("shift-add-end").value = "";
  document.getElementById("shift-add-qty").value = 1;

  document.getElementById("shift-add-overlay").classList.add("open");

  // Load roles into dropdown
  const select = document.getElementById("shift-add-role");
  select.innerHTML = '<option value="">Loading…</option>';
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/roles`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error();
    const roles = await res.json();
    select.innerHTML =
      '<option value="">Select a role…</option>' +
      roles
        .map(
          (r) =>
            `<option value="${escapeHtml(r.rollId)}">${escapeHtml(r.rollName)}</option>`,
        )
        .join("");
  } catch {
    select.innerHTML = '<option value="">Error loading roles</option>';
  }
}

function closeShiftAddModal() {
  document.getElementById("shift-add-overlay").classList.remove("open");
  addingShiftEventId = null;
  addingShiftEventDate = null;
}

document
  .getElementById("shift-add-close")
  .addEventListener("click", closeShiftAddModal);
document
  .getElementById("shift-add-cancel")
  .addEventListener("click", closeShiftAddModal);
document.getElementById("shift-add-overlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("shift-add-overlay"))
    closeShiftAddModal();
});

document
  .getElementById("btn-save-shift-add")
  .addEventListener("click", async () => {
    if (!addingShiftEventId) return;

    const rollId = document.getElementById("shift-add-role").value;
    const start = document.getElementById("shift-add-start").value;
    const end = document.getElementById("shift-add-end").value;
    const qty = parseInt(document.getElementById("shift-add-qty").value, 10);

    const errEl = document.getElementById("shift-add-error");
    errEl.style.display = "none";

    if (!rollId) {
      errEl.textContent = "Please select a role.";
      errEl.style.display = "";
      return;
    }
    if (!start) {
      errEl.textContent = "Please enter a start time.";
      errEl.style.display = "";
      return;
    }
    if (!end) {
      errEl.textContent = "Please enter an end time.";
      errEl.style.display = "";
      return;
    }
    if (end <= start) {
      errEl.textContent = "End time must be after start time.";
      errEl.style.display = "";
      return;
    }
    if (!qty || qty < 1) {
      errEl.textContent = "Required quantity must be at least 1.";
      errEl.style.display = "";
      return;
    }

    // Compose full ISO datetime: use event's date + chosen time
    const date = addingShiftEventDate || new Date().toISOString().slice(0, 10);
    const startDt = `${date}T${start}:00`;
    const endDt = `${date}T${end}:00`;

    const btn = document.getElementById("btn-save-shift-add");
    btn.disabled = true;
    btn.textContent = "Saving…";

    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE}/events/${encodeURIComponent(addingShiftEventId)}/shifts`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rollId,
            startTime: startDt,
            endTime: endDt,
            requiredQuantity: qty,
          }),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        errEl.textContent = data.error || "Error saving shift.";
        errEl.style.display = "";
        return;
      }

      closeShiftAddModal();
      if (currentProjectId) loadProjectSchedule(currentProjectId);
    } catch {
      errEl.textContent = "Network error. Please try again.";
      errEl.style.display = "";
    } finally {
      btn.disabled = false;
      btn.innerHTML = `${_ICON.plus} Add Shift`;
    }
  });


// ── PROJECT STAFFING (Employees Tab) ──────────────────────────────────────────

function renderStaffingTab() {
  const root = document.getElementById("ps-root");
  if (!root) return;
  root.innerHTML = _buildStaffingHTML();
  if (window.lucide) lucide.createIcons();
  _initStaffingHandlers();
  _startStaffingPoll();

  // Fetch potential workers for each real event in background
  const events = currentProjectDetail?.events ?? [];
  events.forEach((ev) => {
    if (currentProjectId)
      loadAndRenderPotentialWorkers(currentProjectId, ev.eventId);
    loadAndRenderEventWorkers(ev.eventId);
  });
}

function _buildStaffingHTML() {
  const events = currentProjectDetail?.events ?? [];

  if (events.length === 0) {
    return `
      <div class="ps-header">
        <div class="ps-header-info">
          <h3 class="ps-header-title">Staffing &amp; Assignments</h3>
          <p class="ps-header-desc">Manage worker assignments for this project's shifts and events.</p>
        </div>
      </div>
      <div class="pd-placeholder" style="margin-top:32px">
        No events in this project yet.
      </div>`;
  }

  const eventsHtml = events
    .map((ev) => {
      const meta = _formatEventMeta(ev);
      return `
    <div class="ps-event-block" data-event-id="${escapeHtml(ev.eventId)}">
      <div class="ps-event-header">
        <span class="ps-event-name">${escapeHtml(ev.name)}</span>
        <span class="ps-event-meta">${escapeHtml(meta)}</span>
      </div>
      ${_buildPotentialSection(ev.eventId)}
      ${_buildStaffingSection(ev.eventId, "awaiting", "Awaiting Response", "clock", "pending", [], "awaiting")}
      ${_buildStaffingSection(ev.eventId, "applicants", "Shift Applicants", "inbox", "pending", [], "applicant")}
      ${_buildStaffingSection(ev.eventId, "approved", "Approved Workers", "check-circle", "approved", [], "approved")}
      ${_buildStaffingSection(ev.eventId, "hold", "Hold / Standby", "pause-circle", "hold", [], "hold")}
      ${_buildStaffingSection(ev.eventId, "rejected", "Rejected Workers", "x-circle", "rejected", [], "rejected")}
    </div>`;
    })
    .join("");

  return `
    <div class="ps-header">
      <div class="ps-header-info">
        <h3 class="ps-header-title">Staffing &amp; Assignments</h3>
        <p class="ps-header-desc">Manage worker assignments for this project's shifts and events.</p>
      </div>
      <div class="ps-header-actions">
        <div class="ps-search-wrap">
          <i data-lucide="search" class="ps-search-icon"></i>
          <input type="text" class="ps-search" id="ps-search-input" placeholder="Search workers…">
        </div>
      </div>
    </div>
    ${eventsHtml}
  `;
}

function _formatEventMeta(ev) {
  const parts = [];
  if (ev.startTime) {
    const d = new Date(ev.startTime);
    const datePart = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const startT = d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    let timePart = startT;
    if (ev.endTime) {
      const endT = new Date(ev.endTime).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      timePart += `–${endT}`;
    }
    parts.push(`${datePart} · ${timePart}`);
  }
  if (ev.location) parts.push(ev.location);
  return parts.join(" · ");
}

function _buildStaffingSection(
  eventId,
  key,
  title,
  icon,
  badgeType,
  workers,
  sectionType,
) {
  const rows =
    workers.length === 0
      ? `<tr><td colspan="5" class="ps-empty">No workers in this category yet.</td></tr>`
      : workers.map((w) => _buildWorkerRow(w, sectionType)).join("");

  // The Auto-Assign button only appears on the "applicants" section
  const autoAssignBtn =
    key === "applicants"
      ? `<button class="btn-auto-assign" data-action="auto-assign" data-event-id="${eventId}">⚡ Auto-Assign</button>`
      : "";

  return `
    <div class="ps-section" id="ps-section-${eventId}-${key}" data-pinned="false" data-section-type="${key}">
      <div class="ps-section-hdr" data-ps-section="${eventId}-${key}">
        <div class="ps-section-hdr-left">
          <i data-lucide="${icon}" class="ps-section-icon"></i>
          <span class="ps-section-title">${title}</span>
          <span class="ps-badge ps-badge--${badgeType}">${workers.length}</span>
          ${autoAssignBtn}
        </div>
        <span class="ps-chevron">▾</span>
      </div>
      <div class="ps-section-body" id="ps-body-${eventId}-${key}">
        <table class="ps-table">
          <thead><tr>
            <th>Worker Info</th><th>Applied Shift</th><th>Applied Role</th><th>Cost</th><th>Actions</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function _buildWorkerRow(worker, sectionType) {
  const initials =
    ((worker.firstName ?? "")[0] ?? "") + ((worker.lastName ?? "")[0] ?? "");
  const name = `${worker.firstName ?? ""} ${worker.lastName ?? ""}`.trim();

  let btns = "";
  if (sectionType !== "awaiting") {
    if (sectionType === "applicant" || sectionType === "hold")
      btns += `<button class="ps-action-btn ps-action-btn--approve" data-action="approve" title="Approve"><i data-lucide="check"></i></button>`;
    if (sectionType === "applicant" || sectionType === "approved")
      btns += `<button class="ps-action-btn ps-action-btn--hold" data-action="hold" title="Hold"><i data-lucide="pause"></i></button>`;
    if (sectionType !== "rejected")
      btns += `<button class="ps-action-btn ps-action-btn--reject" data-action="reject" title="Reject"><i data-lucide="x"></i></button>`;
    if (sectionType === "rejected")
      btns += `<button class="ps-send-btn ps-send-btn--return" data-action="return-to-pool" title="Move to Potential"><i data-lucide="users"></i> Return to Pool</button>`;
  }
  btns += `<button class="ps-action-btn ps-action-btn--msg" data-action="message" title="Message"><i data-lucide="message-circle"></i></button>`;

  return `
    <tr class="ps-row"
        data-worker-fbuid="${escapeHtml(worker.fbUid ?? "")}"
        data-worker-status="${escapeHtml(worker.status ?? "")}"
        data-shift-id="${escapeHtml(worker.shiftId ?? "")}">
      <td><div class="ps-cell-worker">
        <div class="ps-avatar">${escapeHtml(initials.toUpperCase())}</div>
        <div>
          <div class="ps-worker-name">${escapeHtml(name)}</div>
          <div class="ps-worker-meta">${escapeHtml(worker.roleName ?? "")}</div>
        </div>
      </div></td>
      <td><span class="ps-shift-badge">${escapeHtml((worker.shiftId ?? "").slice(0, 8))}</span></td>
      <td><span class="ps-role-chip">${escapeHtml(worker.roleName ?? "")}</span></td>
      <td class="ps-cost">—</td>
      <td><div class="ps-actions-cell">${btns}</div></td>
    </tr>`;
}

function _renderEventWorkerSection(eventId, key, workers, sectionType) {
  const body = document.getElementById(`ps-body-${eventId}-${key}`);
  const badge = document.querySelector(
    `#ps-section-${eventId}-${key} .ps-badge`,
  );
  if (!body) return;

  const tbody = body.querySelector("tbody");
  if (!tbody) return;

  const rows =
    workers.length === 0
      ? `<tr><td colspan="5" class="ps-empty">No workers in this category yet.</td></tr>`
      : workers.map((w) => _buildWorkerRow(w, sectionType)).join("");

  tbody.innerHTML = rows;
  if (badge) badge.textContent = workers.length;
  if (window.lucide) lucide.createIcons();
}

async function loadAndRenderEventWorkers(eventId) {
  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/events/${encodeURIComponent(eventId)}/workers`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error("Failed to load event workers");
    const data = await res.json();

    _renderEventWorkerSection(
      eventId,
      "awaiting",
      data.awaiting ?? [],
      "awaiting",
    );
    _renderEventWorkerSection(
      eventId,
      "applicants",
      data.applicants ?? [],
      "applicant",
    );
    _renderEventWorkerSection(
      eventId,
      "approved",
      data.approved ?? [],
      "approved",
    );
    _renderEventWorkerSection(eventId, "hold", data.hold ?? [], "hold");
    _renderEventWorkerSection(
      eventId,
      "rejected",
      data.rejected ?? [],
      "rejected",
    );
    _renderOverlapWarnings(eventId, data.approved ?? []);
  } catch (err) {
    console.error("[Staffing] Failed to load event workers:", err);
  }
}

function _shiftsOverlap(a, b) {
  const aStart = a.shiftStart ? new Date(a.shiftStart) : null;
  const aEnd = a.shiftEnd ? new Date(a.shiftEnd) : null;
  const bStart = b.shiftStart ? new Date(b.shiftStart) : null;
  const bEnd = b.shiftEnd ? new Date(b.shiftEnd) : null;
  if (!aStart || !bStart) return false;
  const aEndEff = aEnd ?? aStart;
  const bEndEff = bEnd ?? bStart;
  return aStart < bEndEff && bStart < aEndEff;
}

function _renderOverlapWarnings(eventId, approved) {
  // Group approved workers by fbUid
  const byWorker = new Map();
  for (const w of approved) {
    if (!byWorker.has(w.fbUid)) byWorker.set(w.fbUid, []);
    byWorker.get(w.fbUid).push(w);
  }

  // Find all pairs that overlap
  const warnings = [];
  for (const [, shifts] of byWorker) {
    if (shifts.length < 2) continue;
    for (let i = 0; i < shifts.length; i++) {
      for (let j = i + 1; j < shifts.length; j++) {
        if (_shiftsOverlap(shifts[i], shifts[j])) {
          const name = `${shifts[i].firstName} ${shifts[i].lastName}`.trim();
          warnings.push(
            `<strong>${escapeHtml(name)}</strong> is approved for both ` +
              `<em>${escapeHtml(shifts[i].roleName)}</em> and <em>${escapeHtml(shifts[j].roleName)}</em> ` +
              `with overlapping shift times.`,
          );
        }
      }
    }
  }

  // Inject or clear the warning banner above the approved section
  const sectionEl = document.getElementById(`ps-section-${eventId}-approved`);
  const existingBanner = sectionEl?.previousElementSibling;
  if (existingBanner?.classList.contains("ps-overlap-banner")) {
    existingBanner.remove();
  }

  if (warnings.length === 0 || !sectionEl) return;

  const banner = document.createElement("div");
  banner.className = "ps-overlap-banner";
  banner.innerHTML = `
    <i data-lucide="alert-triangle" style="flex-shrink:0;width:16px;height:16px"></i>
    <div>
      <strong>Shift overlap detected</strong>
      <ul>${warnings.map((w) => `<li>${w}</li>`).join("")}</ul>
    </div>`;
  sectionEl.insertAdjacentElement("beforebegin", banner);
  if (window.lucide) lucide.createIcons();
}

function _startStaffingPoll() {
  // Only clear the interval — do NOT abort the click controller (it was just set up)
  if (_staffingPollInterval !== null) {
    clearInterval(_staffingPollInterval);
    _staffingPollInterval = null;
  }
  const events = currentProjectDetail?.events ?? [];
  _staffingPollInterval = setInterval(() => {
    events.forEach((ev) => loadAndRenderEventWorkers(ev.eventId));
  }, 15000);
}

function _stopStaffingPoll() {
  if (_staffingPollInterval !== null) {
    clearInterval(_staffingPollInterval);
    _staffingPollInterval = null;
  }
  if (_staffingClickController) {
    _staffingClickController.abort();
    _staffingClickController = null;
  }
}

async function _handleWorkerStatusChange(
  eventId,
  fbUid,
  shiftId,
  newStatus,
  btn,
) {
  btn.disabled = true;
  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/events/${encodeURIComponent(eventId)}/workers/${encodeURIComponent(fbUid)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus, shiftId }),
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // 409 = employee already approved in another shift of this event
      if (res.status === 409)
        throw new Error(
          body.error ??
            "This employee is already approved for another shift in this event.",
        );
      throw new Error("Failed to update status");
    }
    await loadAndRenderEventWorkers(eventId);
  } catch (err) {
    // btn may be detached after re-render — re-query by fbUid+shiftId
    document
      .querySelectorAll(
        `.ps-row[data-worker-fbuid="${CSS.escape(fbUid)}"][data-shift-id="${CSS.escape(shiftId)}"] [data-action]`,
      )
      .forEach((b) => {
        b.disabled = false;
      });
    alert(err.message);
  }
}

async function _handleAutoAssign(eventId, btn) {
  // Find every shift ID that has applicants inside this event's applicants section
  const section = document.getElementById(`ps-section-${eventId}-applicants`);
  const shiftIds = [
    ...new Set(
      [...section.querySelectorAll(".ps-row[data-shift-id]")]
        .map((r) => r.dataset.shiftId)
        .filter(Boolean),
    ),
  ];

  if (shiftIds.length === 0) {
    alert("No applicants to assign.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Assigning…";

  const token = await getToken();
  const results = [];

  try {
    for (const shiftId of shiftIds) {
      const res = await fetch(`${API_BASE}/shifts/${shiftId}/auto-assign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Server error on shift ${shiftId}`);
      }

      const data = await res.json();
      results.push(data);
    }

    // Refresh the workers panel — this re-renders the button so reset it first
    btn.disabled = false;
    btn.textContent = "⚡ Auto-Assign";
    await loadAndRenderEventWorkers(eventId);

    // Build a short summary message for the manager
    const totalAssigned = results.reduce((s, r) => s + r.assigned, 0);
    const totalStandby = results.reduce((s, r) => s + r.standby, 0);
    const warnings = results.map((r) => r.warning).filter(Boolean);

    let msg = `✅ Auto-assign complete.\nAssigned: ${totalAssigned}  |  Standby: ${totalStandby}`;
    if (warnings.length > 0) msg += `\n\n⚠️ ${warnings.join("\n")}`;
    alert(msg);
  } catch (err) {
    console.error("Auto-assign failed:", err);
    alert(`Auto-assign failed: ${err.message}`);
    btn.disabled = false;
    btn.textContent = "⚡ Auto-Assign";
  }
}

async function _handleReturnToPool(eventId, fbUid, shiftId, btn) {
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="ps-spin"></i>`;
  if (window.lucide) lucide.createIcons();

  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/events/${encodeURIComponent(eventId)}/workers/${encodeURIComponent(fbUid)}?shiftId=${encodeURIComponent(shiftId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) throw new Error("Failed to remove assignment");

    await loadAndRenderEventWorkers(eventId);
    if (currentProjectId)
      await loadAndRenderPotentialWorkers(currentProjectId, eventId);

    // Auto-open the Potential Workers section so the returned worker is visible
    const potentialSection = document.getElementById(
      `ps-section-${eventId}-potential`,
    );
    if (potentialSection) {
      const potentialHdr = potentialSection.querySelector(".ps-section-hdr");
      if (potentialHdr) _setSectionOpen(potentialSection, potentialHdr, true);
    }
  } catch {
    // btn may be detached after partial re-render — re-query or restore if still attached
    if (btn.isConnected) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="users"></i> Return to Pool`;
      if (window.lucide) lucide.createIcons();
    }
    alert("Failed to return worker to pool. Please try again.");
  }
}

// Builds the potential section with a loading skeleton (workers populated async)
function _buildPotentialSection(eventId) {
  return `
    <div class="ps-section" id="ps-section-${eventId}-potential" data-pinned="false" data-section-type="potential">
      <div class="ps-section-hdr" data-ps-section="${eventId}-potential">
        <div class="ps-section-hdr-left">
          <i data-lucide="users" class="ps-section-icon"></i>
          <span class="ps-section-title">Potential Workers</span>
          <span class="ps-badge ps-badge--potential" id="ps-badge-${eventId}-potential">…</span>
        </div>
        <div class="ps-section-hdr-right">
          <button class="ps-btn-primary ps-btn-send-all" data-event-id="${eventId}" disabled>
            <i data-lucide="send"></i>
            Send Request to All
          </button>
          <span class="ps-chevron">▾</span>
        </div>
      </div>
      <div class="ps-section-body" id="ps-body-${eventId}-potential">
        <div class="ps-potential-loading">
          <div class="ps-skel ps-skel-row"></div>
          <div class="ps-skel ps-skel-row"></div>
        </div>
      </div>
    </div>`;
}

// Called after fetch to replace loading state with real worker rows
function _replacePotentialContent(eventId, workers) {
  const body = document.getElementById(`ps-body-${eventId}-potential`);
  const badge = document.getElementById(`ps-badge-${eventId}-potential`);
  const sendAll = document.querySelector(
    `.ps-btn-send-all[data-event-id="${eventId}"]`,
  );
  if (!body) return;

  badge.textContent = workers.length;
  sendAll.disabled = workers.length === 0;

  if (workers.length === 0) {
    body.innerHTML = `
      <table class="ps-table"><tbody>
        <tr><td colspan="4" class="ps-empty">No eligible workers available for this event's shifts.</td></tr>
      </tbody></table>`;
    return;
  }

  const rows = workers
    .map((w) => {
      const initials = (w.firstName[0] + (w.lastName[0] || "")).toUpperCase();
      const costLabel = w.costPerHour
        ? `₪${Number(w.costPerHour).toFixed(0)}/hr`
        : "—";

      const shiftChecks = w.eligibleShifts
        .map((s) => {
          const isFull = s.activeAssignments >= s.requiredQuantity;
          const timeLabel = s.startTime
            ? new Date(s.startTime).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }) +
              (s.endTime
                ? "–" +
                  new Date(s.endTime).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })
                : "")
            : "";
          return `
        <label class="ps-shift-check">
          <input type="checkbox" data-shift-id="${escapeHtml(s.shiftId)}" checked>
          <span class="ps-role-chip">${escapeHtml(s.roleName)}</span>
          ${timeLabel ? `<span class="ps-shift-time">${timeLabel}</span>` : ""}
          ${isFull ? `<span class="ps-shift-full">Full ${s.activeAssignments}/${s.requiredQuantity}</span>` : `<span class="ps-shift-slots">${s.activeAssignments}/${s.requiredQuantity}</span>`}
        </label>`;
        })
        .join("");

      return `
      <tr class="ps-row ps-row--potential" data-worker-fbuid="${escapeHtml(w.fbUid)}" data-worker-id="${escapeHtml(w.userId)}">
        <td><div class="ps-cell-worker">
          <div class="ps-avatar ps-avatar--potential">${escapeHtml(initials)}</div>
          <div>
            <div class="ps-worker-name">${escapeHtml(w.firstName)} ${escapeHtml(w.lastName)}</div>
            <div class="ps-worker-meta">${costLabel}</div>
          </div>
        </div></td>
        <td><div class="ps-shift-checklist">${shiftChecks}</div></td>
        <td class="ps-cost">${escapeHtml(costLabel)}</td>
        <td><div class="ps-actions-cell">
          <button class="ps-send-btn ps-btn--send-worker" data-action="send-request" title="Send shift request">
            <i data-lucide="send"></i> Send Request
          </button>
          <button class="ps-action-btn ps-action-btn--msg" data-action="message" title="Message">
            <i data-lucide="message-circle"></i>
          </button>
        </div></td>
      </tr>`;
    })
    .join("");

  body.innerHTML = `
    <table class="ps-table">
      <thead><tr>
        <th>Worker Info</th><th>Eligible Shifts</th><th>Cost</th><th>Actions</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  if (window.lucide) lucide.createIcons();
  _attachPotentialWorkerHandlers(eventId);
}

async function loadAndRenderPotentialWorkers(projectId, eventId) {
  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/projects/${encodeURIComponent(projectId)}/events/${encodeURIComponent(eventId)}/potential-workers`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error("Failed to load");
    const workers = await res.json();
    _replacePotentialContent(eventId, workers);
  } catch {
    const body = document.getElementById(`ps-body-${eventId}-potential`);
    if (body)
      body.innerHTML = `
      <table class="ps-table"><tbody>
        <tr><td colspan="4" class="ps-empty" style="color:var(--red)">Failed to load potential workers.</td></tr>
      </tbody></table>`;
    const badge = document.getElementById(`ps-badge-${eventId}-potential`);
    if (badge) badge.textContent = "!";
  }
}

function _attachPotentialWorkerHandlers(eventId) {
  const body = document.getElementById(`ps-body-${eventId}-potential`);
  if (!body) return;

  // Per-worker send request
  body.querySelectorAll(".ps-btn--send-worker").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const row = btn.closest(".ps-row--potential");
      const fbuid = row?.dataset.workerFbuid;
      if (!fbuid || !currentProjectId) return;

      const shiftIds = [
        ...row.querySelectorAll("input[data-shift-id]:checked"),
      ].map((cb) => cb.dataset.shiftId);
      if (shiftIds.length === 0) {
        alert("Select at least one shift before sending.");
        return;
      }

      await _sendOfferToWorker(
        currentProjectId,
        eventId,
        fbuid,
        shiftIds,
        btn,
        row,
      );
    });
  });

  // Send to all
  const sendAll = document.querySelector(
    `.ps-btn-send-all[data-event-id="${eventId}"]`,
  );
  if (sendAll) {
    sendAll.addEventListener("click", async (e) => {
      e.stopPropagation();
      sendAll.disabled = true;
      sendAll.innerHTML = `<i data-lucide="loader-2" class="ps-spin"></i> Sending…`;
      if (window.lucide) lucide.createIcons();

      const rows = [...body.querySelectorAll(".ps-row--potential")];
      for (const row of rows) {
        const fbuid = row.dataset.workerFbuid;
        const shiftIds = [
          ...row.querySelectorAll("input[data-shift-id]:checked"),
        ].map((cb) => cb.dataset.shiftId);
        if (!fbuid || shiftIds.length === 0) continue;
        const btn = row.querySelector(".ps-btn--send-worker");
        await _sendOfferToWorker(
          currentProjectId,
          eventId,
          fbuid,
          shiftIds,
          btn,
          row,
        );
      }

      sendAll.innerHTML = `<i data-lucide="check"></i> All Sent`;
      if (window.lucide) lucide.createIcons();
    });
  }
}

async function _sendOfferToWorker(
  projectId,
  eventId,
  fbuid,
  shiftIds,
  btn,
  row,
) {
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="ps-spin"></i>`;
    if (window.lucide) lucide.createIcons();
  }
  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/projects/${encodeURIComponent(projectId)}/events/${encodeURIComponent(eventId)}/potential-workers/${encodeURIComponent(fbuid)}/send-offer`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ shiftIds }),
      },
    );
    if (!res.ok) throw new Error();

    // Fade out and remove the row
    row.classList.add("ps-row--fade-out");
    row.addEventListener(
      "animationend",
      () => {
        row.remove();
        // Update badge
        const remaining = document.querySelectorAll(
          `#ps-body-${eventId}-potential .ps-row--potential`,
        ).length;
        const badge = document.getElementById(`ps-badge-${eventId}-potential`);
        if (badge) badge.textContent = remaining;
        const sendAll = document.querySelector(
          `.ps-btn-send-all[data-event-id="${eventId}"]`,
        );
        if (sendAll && remaining === 0) sendAll.disabled = true;
        // Show empty state if no rows left
        if (remaining === 0) {
          const body = document.getElementById(`ps-body-${eventId}-potential`);
          if (body)
            body.innerHTML = `
          <table class="ps-table"><tbody>
            <tr><td colspan="4" class="ps-empty">All available workers have been offered shifts.</td></tr>
          </tbody></table>`;
        }
      },
      { once: true },
    );
  } catch {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="send"></i> Send Request`;
      if (window.lucide) lucide.createIcons();
    }
    alert("Failed to send offer. Please try again.");
  }
}

function _initStaffingHandlers() {
  // Accordion: single-click opens/closes, double-click toggles pin
  let clickTimer = null;

  document.querySelectorAll("[data-ps-section]").forEach((hdr) => {
    hdr.addEventListener("click", () => {
      if (clickTimer !== null) {
        // Second click within 250ms → double-click → toggle pin
        clearTimeout(clickTimer);
        clickTimer = null;
        _toggleSectionPin(hdr);
      } else {
        clickTimer = setTimeout(() => {
          clickTimer = null;
          _toggleSectionOpen(hdr);
        }, 250);
      }
    });
  });

  // Live search filter across all rows
  document.getElementById("ps-search-input")?.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll(".ps-root .ps-row").forEach((row) => {
      const name =
        row.querySelector(".ps-worker-name")?.textContent.toLowerCase() ?? "";
      const role =
        row.querySelector(".ps-role-chip")?.textContent.toLowerCase() ?? "";
      row.style.display = name.includes(q) || role.includes(q) ? "" : "none";
    });
  });

  // Action buttons — event delegation handles dynamically rendered rows
  const psRoot = document.querySelector(".ps-root");
  if (psRoot) {
    if (_staffingClickController) _staffingClickController.abort();
    _staffingClickController = new AbortController();
    psRoot.addEventListener(
      "click",
      async (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;

        // Skip potential-worker send-request button (handled separately)
        if (btn.classList.contains("ps-btn--send-worker")) return;

        e.stopPropagation();

        const action = btn.dataset.action;

        // Auto-assign button lives in the section header, not inside a row
        if (action === "auto-assign") {
          const eventId = btn.dataset.eventId;
          if (!eventId) return;
          await _handleAutoAssign(eventId, btn);
          return;
        }

        const row = btn.closest(".ps-row");
        if (!row) return;

        const fbUid = row.dataset.workerFbuid;
        const status = row.dataset.workerStatus;
        const shiftId = row.dataset.shiftId;

        if (action === "message") {
          if (!fbUid) return;
          _initChatSection(); // ensure chat is initialized
          activateSection("chats");
          openChatWith(fbUid);
          return;
        }

        // Extract eventId from the parent section ID: ps-section-{eventId}-{key}
        const section = row.closest(".ps-section");
        const sectionId = section?.id ?? "";
        const match = sectionId.match(
          /^ps-section-(.+)-(applicants|approved|hold|rejected)$/,
        );
        const eventId = match?.[1];

        if (!fbUid || !eventId || !shiftId) return;

        if (action === "return-to-pool") {
          await _handleReturnToPool(eventId, fbUid, shiftId, btn);
          return;
        }

        const statusMap = {
          approve: "manager_approved",
          hold: "manager_hold",
          reject:
            status === "manager_approved"
              ? "manager_approved_canceled"
              : "manager_reject",
        };
        const newStatus = statusMap[action];
        if (!newStatus) return;

        await _handleWorkerStatusChange(
          eventId,
          fbUid,
          shiftId,
          newStatus,
          btn,
        );
      },
      { signal: _staffingClickController.signal },
    );
  }
  // Note: send-request and send-all for potential workers are wired in
  // _attachPotentialWorkerHandlers(), called after each event's workers load.
}

function _setSectionOpen(section, hdr, open) {
  const chevron = hdr.querySelector(".ps-chevron");
  if (open) {
    section.classList.add("ps-section--open");
    if (chevron) chevron.textContent = "▾";
  } else {
    section.classList.remove("ps-section--open");
    section.dataset.pinned = "false";
    section.classList.remove("ps-section--pinned");
    if (chevron) chevron.textContent = "▾";
  }
}

function _toggleSectionOpen(hdr) {
  const section = document.getElementById(
    `ps-section-${hdr.dataset.psSection}`,
  );
  if (!section) return;

  const isOpen = section.classList.contains("ps-section--open");
  const eventBlock = hdr.closest(".ps-event-block");

  if (isOpen) {
    // Single-click on an open section (pinned or not) → close and unpin it
    _setSectionOpen(section, hdr, false);
  } else {
    // Close all non-pinned open sections in the same event block
    eventBlock?.querySelectorAll(".ps-section--open").forEach((other) => {
      if (other.dataset.pinned !== "true") {
        const otherHdr = other.querySelector(".ps-section-hdr");
        if (otherHdr) _setSectionOpen(other, otherHdr, false);
      }
    });
    // Open this section
    _setSectionOpen(section, hdr, true);
  }
}

function _toggleSectionPin(hdr) {
  const section = document.getElementById(
    `ps-section-${hdr.dataset.psSection}`,
  );
  if (!section) return;
  const chevron = hdr.querySelector(".ps-chevron");

  if (section.dataset.pinned === "true") {
    // Unpin (but keep open — user can single-click to close)
    section.dataset.pinned = "false";
    section.classList.remove("ps-section--pinned");
    if (chevron) chevron.textContent = "▾";
  } else {
    // Pin — ensure open, change chevron to em dash
    section.dataset.pinned = "true";
    section.classList.add("ps-section--pinned");
    if (!section.classList.contains("ps-section--open")) {
      section.classList.add("ps-section--open");
    }
    if (chevron) chevron.textContent = "—";
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  EVENT DETAIL PAGE
// ══════════════════════════════════════════════════════════════════════════════

let currentEventId = null;
let _edTasksData = null; // cached tasks for current event
let _edBriefsData = null; // cached briefs for current event
let _edExpandedRow = null; // currently expanded task/brief row
let _edTaskFilterPriority = "all";

// ── Back button ────────────────────────────────────────────────────────────
document
  .getElementById("btn-back-from-event-detail")
  .addEventListener("click", () => {
    activateSection("project-detail");
  });

// ── Tab switching ──────────────────────────────────────────────────────────
document.getElementById("event-detail-tabs").addEventListener("click", (e) => {
  const tab = e.target.closest("[data-etab]");
  if (tab) activateEventTab(tab.dataset.etab);
});

function activateEventTab(name) {
  if (name !== "staffing") _stopStaffingPoll();
  document.querySelectorAll("#event-detail-tabs [data-etab]").forEach((t) => {
    t.classList.toggle("active", t.dataset.etab === name);
  });
  document.querySelectorAll("[data-etab-panel]").forEach((p) => {
    p.style.display = p.dataset.etabPanel === name ? "" : "none";
  });
  if (name === "staffing") renderEdStaffingTab();
  if (name === "workers") renderEdWorkersTab();
  if (name === "tasks") renderEdTasksTab();
  if (name === "briefs") renderEdBriefsTab();
  if (name === "expenses") renderEdExpensesTab();
  if (name === "payroll") renderEdPayrollTab();
  if (name === "finance") renderEdFinanceTab();
}

// ── Open event detail ──────────────────────────────────────────────────────
async function openEventDetail(eventId) {
  currentEventId = eventId;
  _edTasksData = null;
  _edBriefsData = null;
  _edExpandedRow = null;
  _edExpensesData = null;
  _edPayrollData = null;
  _edTaskFilterPriority = "all";

  // Update header from cached project data
  const ev = (currentProjectDetail?.events ?? []).find(
    (e) => e.eventId === eventId,
  );
  document.getElementById("event-detail-project-name").textContent =
    currentProjectDetail?.name ?? "";
  document.getElementById("event-detail-title").textContent =
    ev?.name ?? "Event";
  document.getElementById("event-detail-subtitle").textContent = ev
    ? _edFormatSubtitle(ev)
    : "";

  activateSection("event-detail");

  // Reset priority filter pills
  document
    .querySelectorAll("#ed-task-priority-filters .pd-filter-pill")
    .forEach((p) => {
      p.classList.toggle("active", p.dataset.value === "all");
    });

  activateEventTab("staffing");
}

function _edFormatSubtitle(ev) {
  const parts = [];

  if (ev.startTime) {
    parts.push(
      new Date(ev.startTime).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    );
  }

  const statusLabels = {
    planning: "Planning",
    active: "Active",
    completed: "Completed",
    canceled: "Canceled",
  };
  if (ev.status && statusLabels[ev.status]) parts.push(statusLabels[ev.status]);

  if (ev.startTime) {
    const fmtT = (iso) =>
      new Date(iso).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    const timeStr = ev.endTime
      ? `${fmtT(ev.startTime)}–${fmtT(ev.endTime)}`
      : fmtT(ev.startTime);
    parts.push(timeStr);
  }

  return parts.join(" | ");
}

// ── STAFFING TAB (per-event) ───────────────────────────────────────────────

function renderEdStaffingTab() {
  const root = document.getElementById("ed-staffing-root");
  if (!root) return;

  const ev = (currentProjectDetail?.events ?? []).find(
    (e) => e.eventId === currentEventId,
  );

  root.innerHTML = `
    <div class="ps-header">
      <div class="ps-header-info">
        <h3 class="ps-header-title">Staffing &amp; Assignments</h3>
        <p class="ps-header-desc">Manage worker assignments for this event's shifts.</p>
      </div>
      <div class="ps-header-actions">
        <div class="ps-search-wrap">
          <i data-lucide="search" class="ps-search-icon"></i>
          <input type="text" class="ps-search" id="ps-search-input" placeholder="Search workers…">
        </div>
      </div>
    </div>
    <div class="ps-event-block" data-event-id="${escapeHtml(currentEventId)}">
      ${_buildPotentialSection(currentEventId)}
      ${_buildStaffingSection(currentEventId, "awaiting",   "Awaiting Response",  "clock",        "pending",  [], "awaiting")}
      ${_buildStaffingSection(currentEventId, "applicants", "Shift Applicants",   "inbox",        "pending",  [], "applicant")}
      ${_buildStaffingSection(currentEventId, "approved",   "Approved Workers",   "check-circle", "approved", [], "approved")}
      ${_buildStaffingSection(currentEventId, "hold",       "Hold / Standby",     "pause-circle", "hold",     [], "hold")}
      ${_buildStaffingSection(currentEventId, "rejected",   "Rejected Workers",   "x-circle",     "rejected", [], "rejected")}
    </div>`;

  if (window.lucide) lucide.createIcons();
  _initStaffingHandlers();
  _startStaffingPoll();

  if (currentProjectId)
    loadAndRenderPotentialWorkers(currentProjectId, currentEventId);
  loadAndRenderEventWorkers(currentEventId);
}

// ── WORKERS TAB ────────────────────────────────────────────────────────────

async function renderEdWorkersTab() {
  const root = document.getElementById("ed-workers-root");
  if (!root) return;
  root.innerHTML = '<div class="pd-loading">Loading workers…</div>';

  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/events/${encodeURIComponent(currentEventId)}/workers`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error();
    const data = await res.json();
    root.innerHTML = _buildEdWorkersHTML(data);
  } catch {
    root.innerHTML = '<div class="pd-loading">Failed to load workers.</div>';
  }
}

function _workerStatusLabel(status) {
  const map = {
    manager_approved: "Approved",
    manager_offer_sent: "Offer Sent",
    employee_request: "Applied",
    manager_hold: "On Hold",
    manager_reject: "Rejected",
  };
  return map[status] ?? status;
}

function _buildEdWorkersHTML(data) {
  const sections = [
    { key: "approved", label: "Approved", color: "approved" },
    { key: "awaiting", label: "Awaiting Response", color: "pending" },
    { key: "applicants", label: "Applicants", color: "pending" },
    { key: "hold", label: "On Hold", color: "hold" },
    { key: "rejected", label: "Rejected", color: "rejected" },
  ];

  const fmtTime = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const rows = sections
    .map(({ key, label, color }) => {
      const workers = data[key] ?? [];
      if (workers.length === 0) return "";
      const workerRows = workers
        .map(
          (w) => `
      <tr>
        <td>${escapeHtml(w.firstName)} ${escapeHtml(w.lastName)}</td>
        <td>${escapeHtml(w.roleName)}</td>
        <td>${fmtTime(w.shiftStart)} – ${fmtTime(w.shiftEnd)}</td>
        <td><span class="ed-worker-badge ed-worker-badge--${color}">${escapeHtml(_workerStatusLabel(w.status))}</span></td>
      </tr>`,
        )
        .join("");
      return `
      <div class="ed-worker-section">
        <h4 class="ed-worker-section-title">${escapeHtml(label)} <span class="ed-worker-count">${workers.length}</span></h4>
        <table class="ed-worker-table">
          <thead><tr><th>Name</th><th>Role</th><th>Shift</th><th>Status</th></tr></thead>
          <tbody>${workerRows}</tbody>
        </table>
      </div>`;
    })
    .join("");

  const total =
    (data.approved?.length ?? 0) +
    (data.awaiting?.length ?? 0) +
    (data.applicants?.length ?? 0) +
    (data.hold?.length ?? 0) +
    (data.rejected?.length ?? 0);

  if (total === 0) {
    return '<div class="pd-empty-state">No workers assigned to this event yet.</div>';
  }
  return `<div class="ed-worker-sections">${rows}</div>`;
}

// ── TASKS TAB ──────────────────────────────────────────────────────────────

async function renderEdTasksTab() {
  if (_edTasksData !== null) {
    _edApplyTaskFilters();
    return;
  }

  TASK_STATUSES.forEach((s) => {
    const col = document.getElementById(`ed-col-${s}`);
    if (col) col.innerHTML = '<div class="pd-loading">Loading…</div>';
  });

  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/events/${encodeURIComponent(currentEventId)}/tasks`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error();
    _edTasksData = await res.json();
    _edApplyTaskFilters();
  } catch {
    TASK_STATUSES.forEach((s) => {
      const col = document.getElementById(`ed-col-${s}`);
      if (col) col.innerHTML = "";
    });
    const col = document.getElementById("ed-col-open");
    if (col)
      col.innerHTML = '<div class="pd-loading">Failed to load tasks.</div>';
  }
}

function _edApplyTaskFilters() {
  if (_edTasksData === null) return;
  const openCol = document.getElementById("ed-col-open");
  if (openCol?.querySelector('[data-new="true"]')) return;
  if (_edExpandedRow) _edExpandedRow = null;

  const filtered = _edTasksData.filter(
    (t) =>
      _edTaskFilterPriority === "all" || t.priority === _edTaskFilterPriority,
  );
  filtered.sort(
    (a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99),
  );

  TASK_STATUSES.forEach((status) => {
    const col = document.getElementById(`ed-col-${status}`);
    const countEl = document.getElementById(`ed-col-count-${status}`);
    if (!col) return;
    const colWrapper = col.closest(".pd-kanban-col");
    const colTasks = filtered.filter((t) => t.status === status);
    if (colTasks.length === 0) {
      col.innerHTML = "";
      if (countEl) countEl.textContent = "0";
      if (colWrapper) colWrapper.style.display = "none";
      return;
    }
    if (colWrapper) colWrapper.style.display = "";
    if (countEl) countEl.textContent = colTasks.length;
    col.innerHTML = "";
    colTasks.forEach((t) => col.appendChild(_edBuildTaskRow(t)));
  });
}

function _edBuildTaskRow(task) {
  const row = document.createElement("div");
  row.className = `pd-task-row pd-task-row--${task.status}`;
  row.dataset.taskId = task.taskId;
  row.innerHTML = `
    <div class="pd-row-summary">
      <span class="pd-task-content">${escapeHtml(task.content)}</span>
      <div class="pd-row-meta">
        <span class="pd-badge pd-badge--priority-${task.priority}">${task.priority}</span>
        <button class="pd-row-delete-btn" title="Delete task" aria-label="Delete task">&#10005;</button>
      </div>
    </div>
    <div class="pd-row-form">
      <label class="pd-field-label">Content</label>
      <input type="text" class="pd-form-input" name="content" value="${escapeHtml(task.content)}" placeholder="Task description…" maxlength="500">
      <div class="pd-form-selects">
        <div class="pd-select-field">
          <label class="pd-field-label">Status</label>
          <select class="pd-form-select" name="status">
            ${["open", "in_progress", "done", "canceled"]
              .map(
                (s) =>
                  `<option value="${s}"${task.status === s ? " selected" : ""}>${s.replace("_", " ")}</option>`,
              )
              .join("")}
          </select>
        </div>
        <div class="pd-select-field">
          <label class="pd-field-label">Priority</label>
          <select class="pd-form-select" name="priority">
            ${["low", "medium", "high", "urgent"]
              .map(
                (p) =>
                  `<option value="${p}"${task.priority === p ? " selected" : ""}>${p}</option>`,
              )
              .join("")}
          </select>
        </div>
      </div>
      <div class="pd-form-actions">
        <button class="pd-form-save-btn" disabled>Save</button>
        <button class="pd-form-cancel-btn">Cancel</button>
      </div>
    </div>`;
  _edWireTaskRow(row, task);
  return row;
}

function _edWireTaskRow(row, task) {
  const summary = row.querySelector(".pd-row-summary");
  const form = row.querySelector(".pd-row-form");
  const contentIn = row.querySelector('input[name="content"]');
  const statusSel = row.querySelector('select[name="status"]');
  const prioritySel = row.querySelector('select[name="priority"]');
  const saveBtn = row.querySelector(".pd-form-save-btn");
  const cancelBtn = row.querySelector(".pd-form-cancel-btn");
  const deleteBtn = row.querySelector(".pd-row-delete-btn");

  summary.addEventListener("click", (e) => {
    if (e.target === deleteBtn || deleteBtn.contains(e.target)) return;
    if (row.classList.contains("pd-row--deleting")) return;
    if (_edExpandedRow === row) {
      _edCollapseRow(row);
      return;
    }
    if (_edExpandedRow) _edCollapseRow(_edExpandedRow);
    _edExpandedRow = row;
    form.classList.add("expanded");
    row.classList.add("pd-row--expanded");
  });

  const isDirty = () =>
    contentIn.value.trim() !== task.content ||
    statusSel.value !== task.status ||
    prioritySel.value !== task.priority;

  [contentIn, statusSel, prioritySel].forEach((el) =>
    el.addEventListener("input", () => {
      saveBtn.disabled = !isDirty();
    }),
  );

  cancelBtn.addEventListener("click", () => _edCollapseRow(row));

  saveBtn.addEventListener("click", async () => {
    if (!isDirty()) return;
    const content = contentIn.value.trim();
    const status = statusSel.value;
    const priority = prioritySel.value;
    if (!content) {
      contentIn.focus();
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE}/events/${encodeURIComponent(currentEventId)}/tasks/${encodeURIComponent(task.taskId)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content, status, priority }),
        },
      );
      if (!res.ok) throw new Error();
      const updated = await res.json();
      const idx = _edTasksData.findIndex((t) => t.taskId === task.taskId);
      if (idx !== -1) _edTasksData[idx] = updated;
      _edApplyTaskFilters();
    } catch {
      saveBtn.textContent = "Save";
      saveBtn.disabled = false;
    }
  });

  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (row.classList.contains("pd-row--deleting")) return;
    if (_edExpandedRow && _edExpandedRow !== row)
      _edCollapseRow(_edExpandedRow);
    if (_edExpandedRow === row) _edCollapseRow(row);
    row.classList.add("pd-row--deleting");
    const confirm = document.createElement("div");
    confirm.className = "pd-delete-confirm";
    confirm.innerHTML = `<span>Delete this task?</span>
      <button class="btn-confirm-yes">Delete</button>
      <button class="btn-confirm-no">Cancel</button>`;
    row.querySelector(".pd-row-summary").appendChild(confirm);
    confirm.querySelector(".btn-confirm-no").addEventListener("click", (e) => {
      e.stopPropagation();
      row.classList.remove("pd-row--deleting");
      confirm.remove();
    });
    confirm
      .querySelector(".btn-confirm-yes")
      .addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          const token = await getToken();
          const res = await fetch(
            `${API_BASE}/events/${encodeURIComponent(currentEventId)}/tasks/${encodeURIComponent(task.taskId)}`,
            { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
          );
          if (!res.ok) throw new Error();
          _edTasksData = _edTasksData.filter((t) => t.taskId !== task.taskId);
          if (_edExpandedRow === row) _edExpandedRow = null;
          _edApplyTaskFilters();
        } catch {
          row.classList.remove("pd-row--deleting");
          confirm.remove();
        }
      });
  });
}

function _edCollapseRow(row) {
  row.querySelector(".pd-row-form")?.classList.remove("expanded");
  row.classList.remove("pd-row--expanded");
  if (_edExpandedRow === row) _edExpandedRow = null;
}

function _edAddNewTaskRow() {
  const list = document.getElementById("ed-col-open");
  if (!list) return;
  if (list.querySelector('[data-new="true"]')) return;
  const colWrapper = list.closest(".pd-kanban-col");
  if (colWrapper) colWrapper.style.display = "";

  const tempTask = {
    taskId: "",
    content: "",
    status: "open",
    priority: "medium",
  };
  const row = _edBuildTaskRow(tempTask);
  row.dataset.new = "true";
  row.querySelector(".pd-row-delete-btn").style.display = "none";

  const form = row.querySelector(".pd-row-form");
  const contentIn = row.querySelector('input[name="content"]');
  const statusSel = row.querySelector('select[name="status"]');
  const prioritySel = row.querySelector('select[name="priority"]');
  const saveBtn = row.querySelector(".pd-form-save-btn");
  const cancelBtn = row.querySelector(".pd-form-cancel-btn");

  cancelBtn.addEventListener("click", () => {
    if (_edExpandedRow === row) _edExpandedRow = null;
    row.remove();
    if (_edTasksData !== null) _edApplyTaskFilters();
    else list.innerHTML = '<div class="pd-kanban-empty">No tasks</div>';
  });

  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.replaceWith(newSaveBtn);
  newSaveBtn.disabled = true;
  contentIn.addEventListener("input", () => {
    newSaveBtn.disabled = contentIn.value.trim() === "";
  });

  newSaveBtn.addEventListener("click", async () => {
    const content = contentIn.value.trim();
    const status = statusSel.value;
    const priority = prioritySel.value;
    if (!content) {
      contentIn.focus();
      return;
    }
    newSaveBtn.disabled = true;
    newSaveBtn.textContent = "Saving…";
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE}/events/${encodeURIComponent(currentEventId)}/tasks`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content, status, priority }),
        },
      );
      if (!res.ok) throw new Error();
      const created = await res.json();
      if (_edTasksData === null) _edTasksData = [];
      _edTasksData.push(created);
      if (_edExpandedRow === row) _edExpandedRow = null;
      row.remove();
      _edApplyTaskFilters();
    } catch {
      newSaveBtn.textContent = "Save";
      newSaveBtn.disabled = false;
    }
  });

  if (_edExpandedRow) _edCollapseRow(_edExpandedRow);
  const emptyEl = list.querySelector(".pd-kanban-empty");
  if (emptyEl) emptyEl.remove();
  list.prepend(row);
  _edExpandedRow = row;
  requestAnimationFrame(() => {
    form.classList.add("expanded");
    row.classList.add("pd-row--expanded");
    contentIn.focus();
  });
}

// Wire event detail task/brief add buttons
document
  .getElementById("ed-btn-add-task")
  .addEventListener("click", () => _edAddNewTaskRow());
document
  .getElementById("ed-btn-add-brief")
  .addEventListener("click", () => _edAddNewBriefRow());

// Priority filters for event tasks
document
  .getElementById("ed-task-priority-filters")
  .addEventListener("click", (e) => {
    const pill = e.target.closest(".pd-filter-pill");
    if (!pill) return;
    _edTaskFilterPriority = pill.dataset.value;
    document
      .querySelectorAll("#ed-task-priority-filters .pd-filter-pill")
      .forEach((p) => {
        p.classList.toggle("active", p.dataset.value === _edTaskFilterPriority);
      });
    if (_edTasksData !== null) _edApplyTaskFilters();
  });

// ── BRIEFS TAB ─────────────────────────────────────────────────────────────

async function renderEdBriefsTab() {
  const list = document.getElementById("ed-brief-list");
  if (!list) return;

  if (_edBriefsData !== null) {
    _edRenderBriefList(list);
    return;
  }

  list.innerHTML = '<div class="pd-loading">Loading briefs…</div>';
  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/events/${encodeURIComponent(currentEventId)}/briefs`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error();
    _edBriefsData = await res.json();
    _edRenderBriefList(list);
  } catch {
    list.innerHTML = '<div class="pd-loading">Failed to load briefs.</div>';
  }
}

function _edRenderBriefList(list) {
  list.innerHTML = _edBriefsData.length === 0 ? briefEmptyStateHtml() : "";
  _edBriefsData.forEach((b) => list.appendChild(_edBuildBriefRow(b)));
}

function _edBuildBriefRow(brief) {
  const row = document.createElement("div");
  row.className = "pd-brief-row";
  row.dataset.briefId = brief.briefId;

  const authorName = brief.createdByManagerName ?? "Unknown";
  const dateStr = brief.createdAt ? formatBriefDate(brief.createdAt) : "";
  const preview =
    brief.content.length > 120
      ? brief.content.slice(0, 120) + "…"
      : brief.content;

  // Acknowledgment summary — always shown, X / Y format
  const ackHtml =
    brief.totalRelevant > 0
      ? `<span class="ed-brief-ack${brief.ackCount >= brief.totalRelevant ? " ed-brief-ack--all" : ""}" title="${brief.ackCount} of ${brief.totalRelevant} acknowledged">&#10003; ${brief.ackCount} / ${brief.totalRelevant}</span>`
      : "";

  row.innerHTML = `
    <div class="pd-row-summary">
      <div class="pd-brief-summary">
        <span class="pd-brief-title-text">${escapeHtml(brief.title)}</span>
        <span class="pd-brief-preview-text">${escapeHtml(preview)}</span>
        <span class="pd-brief-author-text">By: ${escapeHtml(authorName)}${dateStr ? ` · ${dateStr}` : ""}${ackHtml}</span>
      </div>
      <button class="pd-row-delete-btn" title="Delete brief" aria-label="Delete brief">&#10005;</button>
    </div>
    <div class="pd-row-form">
      <label class="pd-field-label">Title</label>
      <input type="text" class="pd-form-input" name="title" value="${escapeHtml(brief.title)}" placeholder="Brief title…" maxlength="200">
      <label class="pd-field-label">Content</label>
      <textarea class="pd-form-textarea pd-form-textarea--large" name="content" rows="5" placeholder="Brief content…" maxlength="5000">${escapeHtml(brief.content)}</textarea>
      <div class="pd-form-actions">
        <button class="pd-form-save-btn" disabled>Save</button>
        <button class="pd-form-cancel-btn">Cancel</button>
      </div>
      <div class="ed-ack-section">
        <div class="ed-ack-header">Acknowledgments</div>
        <div class="ed-brief-ack-list"></div>
      </div>
    </div>`;
  _edWireBriefRow(row, brief);
  return row;
}

function _edWireBriefRow(row, brief) {
  const summary = row.querySelector(".pd-row-summary");
  const form = row.querySelector(".pd-row-form");
  const titleIn = row.querySelector('input[name="title"]');
  const contentIn = row.querySelector('textarea[name="content"]');
  const saveBtn = row.querySelector(".pd-form-save-btn");
  const cancelBtn = row.querySelector(".pd-form-cancel-btn");
  const deleteBtn = row.querySelector(".pd-row-delete-btn");

  summary.addEventListener("click", (e) => {
    if (e.target === deleteBtn || deleteBtn.contains(e.target)) return;
    if (row.classList.contains("pd-row--deleting")) return;
    if (_edExpandedRow === row) {
      _edCollapseRow(row);
      return;
    }
    if (_edExpandedRow) _edCollapseRow(_edExpandedRow);
    _edExpandedRow = row;
    form.classList.add("expanded");
    row.classList.add("pd-row--expanded");

    // Load acknowledgments (once)
    const ackListEl = form.querySelector(".ed-brief-ack-list");
    if (ackListEl && ackListEl.innerHTML === "") {
      ackListEl.innerHTML = '<span class="ed-ack-loading">Loading…</span>';
      getToken().then((token) =>
        fetch(
          `${API_BASE}/events/${encodeURIComponent(currentEventId)}/briefs/${encodeURIComponent(brief.briefId)}/acknowledgments`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((acks) => {
            if (acks.length === 0) {
              ackListEl.innerHTML =
                '<span class="ed-ack-empty">No employees assigned to this brief\'s scope.</span>';
            } else {
              const readCount = acks.filter((a) => a.isRead).length;
              const total = acks.length;
              const headerEl = form.querySelector(".ed-ack-header");
              if (headerEl) {
                headerEl.textContent = `Acknowledgments — ${readCount} / ${total}`;
              }
              ackListEl.innerHTML = acks
                .map(
                  (a) => `
              <div class="ed-ack-item${a.isRead ? " ed-ack-item--read" : ""}">
                <span class="ed-ack-name">${escapeHtml(a.firstName)} ${escapeHtml(a.lastName)}</span>
                ${
                  a.isRead
                    ? `<span class="ed-ack-badge">&#10003; ${a.readAt ? formatBriefDate(a.readAt) : "Acknowledged"}</span>`
                    : `<span class="ed-ack-pending">Pending</span>`
                }
              </div>`,
                )
                .join("");
            }
          })
          .catch(() => {
            ackListEl.innerHTML =
              '<span class="ed-ack-empty">Failed to load.</span>';
          }),
      );
    }
  });

  const isDirty = () =>
    titleIn.value.trim() !== brief.title ||
    contentIn.value.trim() !== brief.content;

  [titleIn, contentIn].forEach((el) =>
    el.addEventListener("input", () => {
      saveBtn.disabled = !isDirty();
    }),
  );

  cancelBtn.addEventListener("click", () => _edCollapseRow(row));

  saveBtn.addEventListener("click", async () => {
    if (!isDirty()) return;
    const title = titleIn.value.trim();
    const content = contentIn.value.trim();
    if (!title) {
      titleIn.focus();
      return;
    }
    if (!content) {
      contentIn.focus();
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE}/events/${encodeURIComponent(currentEventId)}/briefs/${encodeURIComponent(brief.briefId)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title, content }),
        },
      );
      if (!res.ok) throw new Error();
      const updated = await res.json();
      const idx = _edBriefsData.findIndex((b) => b.briefId === brief.briefId);
      if (idx !== -1) _edBriefsData[idx] = updated;
      brief.title = updated.title;
      brief.content = updated.content;
      row.querySelector(".pd-brief-title-text").textContent = updated.title;
      const p =
        updated.content.length > 120
          ? updated.content.slice(0, 120) + "…"
          : updated.content;
      row.querySelector(".pd-brief-preview-text").textContent = p;
      _edCollapseRow(row);
    } catch {
      saveBtn.textContent = "Save";
      saveBtn.disabled = false;
    }
  });

  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (row.classList.contains("pd-row--deleting")) return;
    if (_edExpandedRow && _edExpandedRow !== row)
      _edCollapseRow(_edExpandedRow);
    if (_edExpandedRow === row) _edCollapseRow(row);
    row.classList.add("pd-row--deleting");
    const confirm = document.createElement("div");
    confirm.className = "pd-delete-confirm";
    confirm.innerHTML = `<span>Delete this brief?</span>
      <button class="btn-confirm-yes">Delete</button>
      <button class="btn-confirm-no">Cancel</button>`;
    row.querySelector(".pd-row-summary").appendChild(confirm);
    confirm.querySelector(".btn-confirm-no").addEventListener("click", (e) => {
      e.stopPropagation();
      row.classList.remove("pd-row--deleting");
      confirm.remove();
    });
    confirm
      .querySelector(".btn-confirm-yes")
      .addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          const token = await getToken();
          const res = await fetch(
            `${API_BASE}/events/${encodeURIComponent(currentEventId)}/briefs/${encodeURIComponent(brief.briefId)}`,
            { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
          );
          if (!res.ok) throw new Error();
          _edBriefsData = _edBriefsData.filter(
            (b) => b.briefId !== brief.briefId,
          );
          if (_edExpandedRow === row) _edExpandedRow = null;
          row.remove();
          const list = document.getElementById("ed-brief-list");
          if (list && _edBriefsData.length === 0)
            list.innerHTML = briefEmptyStateHtml();
        } catch {
          row.classList.remove("pd-row--deleting");
          confirm.remove();
        }
      });
  });
}

function _edAddNewBriefRow() {
  const list = document.getElementById("ed-brief-list");
  if (!list) return;
  if (list.querySelector('[data-new="true"]')) return;

  const tempBrief = {
    briefId: "",
    title: "",
    content: "",
    createdAt: null,
    createdByManagerName: null,
  };
  const row = _edBuildBriefRow(tempBrief);
  row.dataset.new = "true";

  const form = row.querySelector(".pd-row-form");
  const titleIn = row.querySelector('input[name="title"]');
  const contentIn = row.querySelector('textarea[name="content"]');
  const saveBtn = row.querySelector(".pd-form-save-btn");
  const cancelBtn = row.querySelector(".pd-form-cancel-btn");

  cancelBtn.addEventListener("click", () => {
    if (_edExpandedRow === row) _edExpandedRow = null;
    row.remove();
    if (_edBriefsData !== null && _edBriefsData.length === 0)
      list.innerHTML = briefEmptyStateHtml();
  });

  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.replaceWith(newSaveBtn);
  newSaveBtn.disabled = true;
  const canSave = () =>
    titleIn.value.trim() !== "" && contentIn.value.trim() !== "";
  [titleIn, contentIn].forEach((el) =>
    el.addEventListener("input", () => {
      newSaveBtn.disabled = !canSave();
    }),
  );

  newSaveBtn.addEventListener("click", async () => {
    const title = titleIn.value.trim();
    const content = contentIn.value.trim();
    if (!title) {
      titleIn.focus();
      return;
    }
    if (!content) {
      contentIn.focus();
      return;
    }
    newSaveBtn.disabled = true;
    newSaveBtn.textContent = "Saving…";
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE}/events/${encodeURIComponent(currentEventId)}/briefs`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title, content }),
        },
      );
      if (!res.ok) throw new Error();
      const created = await res.json();
      if (_edBriefsData === null) _edBriefsData = [];
      _edBriefsData.push(created);
      const emptyEl = list.querySelector(".pd-empty-state");
      if (emptyEl) emptyEl.remove();
      if (_edExpandedRow === row) _edExpandedRow = null;
      row.remove();
      list.appendChild(_edBuildBriefRow(created));
    } catch {
      newSaveBtn.textContent = "Save";
      newSaveBtn.disabled = false;
    }
  });

  if (_edExpandedRow) _edCollapseRow(_edExpandedRow);
  const emptyEl = list.querySelector(".pd-empty-state");
  if (emptyEl) emptyEl.remove();
  list.prepend(row);
  _edExpandedRow = row;
  requestAnimationFrame(() => {
    form.classList.add("expanded");
    row.classList.add("pd-row--expanded");
    titleIn.focus();
  });
}

// ── EXPENSES TAB ───────────────────────────────────────────────────────────

let _edExpensesData = null;

const EXPENSE_TYPES = [
  "venue",
  "catering",
  "equipment",
  "transport",
  "marketing",
  "staff",
  "other",
];

async function renderEdExpensesTab() {
  const list = document.getElementById("ed-expense-list");
  if (!list) return;

  if (_edExpensesData !== null) {
    _edRenderExpenseList(list);
    return;
  }

  list.innerHTML = '<div class="pd-loading">Loading expenses…</div>';
  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/events/${encodeURIComponent(currentEventId)}/expenses`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error();
    _edExpensesData = await res.json();
    _edRenderExpenseList(list);
  } catch {
    list.innerHTML = '<div class="pd-loading">Failed to load expenses.</div>';
  }
}

function _edRenderExpenseList(list) {
  if (_edExpensesData.length === 0) {
    list.innerHTML =
      '<div class="pd-empty-state">No expenses recorded yet.</div>';
    return;
  }
  list.innerHTML = "";
  _edExpensesData.forEach((exp) => list.appendChild(_edBuildExpenseRow(exp)));
  list.appendChild(_edBuildExpenseTotals());
}

function _edBuildExpenseTotals() {
  const total = (_edExpensesData ?? []).reduce(
    (s, e) => s + (e.amount ?? 0),
    0,
  );
  const div = document.createElement("div");
  div.className = "ed-expense-totals";
  div.innerHTML = `<span class="ed-expense-total-label">Total</span>
    <span class="ed-expense-total-value">₪${total.toLocaleString("en-IL", { minimumFractionDigits: 2 })}</span>`;
  return div;
}

function _fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function _edBuildExpenseRow(exp) {
  const row = document.createElement("div");
  row.className = "ed-expense-row";
  row.dataset.expenseId = exp.expenseId;

  const dateVal = exp.expenseDate ? exp.expenseDate.slice(0, 10) : "";

  row.innerHTML = `
    <div class="ed-expense-summary">
      <span class="ed-expense-type-badge">${escapeHtml(exp.expenseType)}</span>
      <span class="ed-expense-desc">${escapeHtml(exp.description || exp.vendorName || "—")}</span>
      <span class="ed-expense-date">${_fmtDate(exp.expenseDate)}</span>
      <span class="ed-expense-amount">₪${(exp.amount ?? 0).toLocaleString("en-IL", { minimumFractionDigits: 2 })}</span>
      <button class="pd-row-delete-btn ed-expense-delete" title="Delete" aria-label="Delete expense">&#10005;</button>
    </div>
    <div class="ed-expense-form" style="display:none">
      <div class="ed-expense-form-grid">
        <div class="pd-select-field">
          <label class="pd-field-label">Type</label>
          <select class="pd-form-select" name="expenseType">
            ${EXPENSE_TYPES.map((t) => `<option value="${t}"${exp.expenseType === t ? " selected" : ""}>${t}</option>`).join("")}
          </select>
        </div>
        <div class="pd-select-field">
          <label class="pd-field-label">Amount (₪)</label>
          <input type="number" class="pd-form-input" name="amount" value="${exp.amount ?? ""}" min="0" step="0.01" placeholder="0.00">
        </div>
        <div class="pd-select-field">
          <label class="pd-field-label">Date</label>
          <input type="date" class="pd-form-input" name="expenseDate" value="${dateVal}">
        </div>
        <div class="pd-select-field">
          <label class="pd-field-label">Vendor</label>
          <input type="text" class="pd-form-input" name="vendorName" value="${escapeHtml(exp.vendorName || "")}" placeholder="Vendor name…" maxlength="200">
        </div>
      </div>
      <label class="pd-field-label">Description</label>
      <input type="text" class="pd-form-input" name="description" value="${escapeHtml(exp.description || "")}" placeholder="Description…" maxlength="500">
      <label class="pd-field-label">Notes</label>
      <textarea class="pd-form-textarea" name="notes" rows="2" maxlength="1000">${escapeHtml(exp.notes || "")}</textarea>
      <div class="pd-form-actions">
        <button class="pd-form-save-btn" disabled>Save</button>
        <button class="pd-form-cancel-btn">Cancel</button>
      </div>
    </div>`;

  _edWireExpenseRow(row, exp);
  return row;
}

function _edWireExpenseRow(row, exp) {
  const summary = row.querySelector(".ed-expense-summary");
  const form = row.querySelector(".ed-expense-form");
  const deleteBtn = row.querySelector(".ed-expense-delete");
  const saveBtn = row.querySelector(".pd-form-save-btn");
  const cancelBtn = row.querySelector(".pd-form-cancel-btn");

  const inputs = form.querySelectorAll("input,select,textarea");

  summary.addEventListener("click", (e) => {
    if (e.target === deleteBtn || deleteBtn.contains(e.target)) return;
    if (row.classList.contains("pd-row--deleting")) return;
    const open = form.style.display !== "none";
    if (open) {
      form.style.display = "none";
      row.classList.remove("pd-row--expanded");
    } else {
      // collapse any other open expense form
      document.querySelectorAll(".ed-expense-form").forEach((f) => {
        f.style.display = "none";
      });
      document
        .querySelectorAll(".ed-expense-row")
        .forEach((r) => r.classList.remove("pd-row--expanded"));
      form.style.display = "";
      row.classList.add("pd-row--expanded");
    }
  });

  const snapshot = () => ({
    expenseType: form.querySelector('[name="expenseType"]').value,
    amount: form.querySelector('[name="amount"]').value,
    expenseDate: form.querySelector('[name="expenseDate"]').value,
    vendorName: form.querySelector('[name="vendorName"]').value.trim(),
    description: form.querySelector('[name="description"]').value.trim(),
    notes: form.querySelector('[name="notes"]').value.trim(),
  });
  const isDirty = () => {
    const s = snapshot();
    return (
      s.expenseType !== exp.expenseType ||
      String(s.amount) !== String(exp.amount ?? "") ||
      s.expenseDate !== (exp.expenseDate ? exp.expenseDate.slice(0, 10) : "") ||
      s.vendorName !== (exp.vendorName ?? "") ||
      s.description !== (exp.description ?? "") ||
      s.notes !== (exp.notes ?? "")
    );
  };

  inputs.forEach((el) =>
    el.addEventListener("input", () => {
      saveBtn.disabled = !isDirty();
    }),
  );
  cancelBtn.addEventListener("click", () => {
    form.style.display = "none";
    row.classList.remove("pd-row--expanded");
  });

  saveBtn.addEventListener("click", async () => {
    if (!isDirty()) return;
    const s = snapshot();
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const token = await getToken();
      const body = {
        expenseType: s.expenseType,
        description: s.description || null,
        amount: s.amount !== "" ? parseFloat(s.amount) : null,
        expenseDate: s.expenseDate || null,
        vendorName: s.vendorName || null,
        notes: s.notes || null,
      };
      const res = await fetch(
        `${API_BASE}/events/${encodeURIComponent(currentEventId)}/expenses/${encodeURIComponent(exp.expenseId)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error();
      const updated = await res.json();
      const idx = _edExpensesData.findIndex(
        (e) => e.expenseId === exp.expenseId,
      );
      if (idx !== -1) _edExpensesData[idx] = updated;
      Object.assign(exp, updated);
      // Refresh summary in-place
      row.querySelector(".ed-expense-type-badge").textContent =
        updated.expenseType;
      row.querySelector(".ed-expense-desc").textContent =
        updated.description || updated.vendorName || "—";
      row.querySelector(".ed-expense-date").textContent = _fmtDate(
        updated.expenseDate,
      );
      row.querySelector(".ed-expense-amount").textContent =
        `₪${(updated.amount ?? 0).toLocaleString("en-IL", { minimumFractionDigits: 2 })}`;
      // Refresh totals
      const list = document.getElementById("ed-expense-list");
      list.querySelector(".ed-expense-totals")?.remove();
      list.appendChild(_edBuildExpenseTotals());
      form.style.display = "none";
      row.classList.remove("pd-row--expanded");
    } catch {
      saveBtn.textContent = "Save";
      saveBtn.disabled = false;
    }
  });

  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (row.classList.contains("pd-row--deleting")) return;
    form.style.display = "none";
    row.classList.remove("pd-row--expanded");
    row.classList.add("pd-row--deleting");
    const confirm = document.createElement("div");
    confirm.className = "pd-delete-confirm ed-expense-delete-confirm";
    confirm.innerHTML = `<span>Delete this expense?</span>
      <button class="btn-confirm-yes">Delete</button>
      <button class="btn-confirm-no">Cancel</button>`;
    // Append to the row (not the summary flex container) to avoid overflow clipping
    summary.insertAdjacentElement("afterend", confirm);
    confirm.querySelector(".btn-confirm-no").addEventListener("click", (e) => {
      e.stopPropagation();
      row.classList.remove("pd-row--deleting");
      confirm.remove();
    });
    confirm
      .querySelector(".btn-confirm-yes")
      .addEventListener("click", async (e) => {
        e.stopPropagation();
        confirm.querySelector(".btn-confirm-yes").disabled = true;
        try {
          const token = await getToken();
          const res = await fetch(
            `${API_BASE}/events/${encodeURIComponent(currentEventId)}/expenses/${encodeURIComponent(exp.expenseId)}`,
            { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
          );
          if (!res.ok) throw new Error();
          _edExpensesData = _edExpensesData.filter(
            (x) => x.expenseId !== exp.expenseId,
          );
          const list = document.getElementById("ed-expense-list");
          _edRenderExpenseList(list);
        } catch {
          row.classList.remove("pd-row--deleting");
          confirm.innerHTML = `<span style="color:#ef4444">Delete failed. Try again.</span>
          <button class="btn-confirm-no">Dismiss</button>`;
          confirm
            .querySelector(".btn-confirm-no")
            .addEventListener("click", (ev) => {
              ev.stopPropagation();
              confirm.remove();
            });
        }
      });
  });
}

function _edAddNewExpenseRow() {
  const list = document.getElementById("ed-expense-list");
  if (!list) return;
  if (list.querySelector(".ed-expense-row[data-new='true']")) return;

  const tempExp = {
    expenseId: "",
    expenseType: "other",
    description: null,
    amount: null,
    expenseDate: null,
    vendorName: null,
    notes: null,
  };
  const row = _edBuildExpenseRow(tempExp);
  row.dataset.new = "true";

  // Auto-open the form
  const form = row.querySelector(".ed-expense-form");
  form.style.display = "";
  row.classList.add("pd-row--expanded");

  // Replace save handler with CREATE
  const saveBtn = row.querySelector(".pd-form-save-btn");
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.replaceWith(newSaveBtn);
  newSaveBtn.disabled = false;

  const cancelBtn = row.querySelector(".pd-form-cancel-btn");
  cancelBtn.addEventListener("click", () => {
    row.remove();
    if (_edExpensesData !== null && _edExpensesData.length === 0) {
      list.innerHTML =
        '<div class="pd-empty-state">No expenses recorded yet.</div>';
    }
  });

  newSaveBtn.addEventListener("click", async () => {
    newSaveBtn.disabled = true;
    newSaveBtn.textContent = "Saving…";
    const body = {
      expenseType: form.querySelector('[name="expenseType"]').value,
      description:
        form.querySelector('[name="description"]').value.trim() || null,
      amount:
        form.querySelector('[name="amount"]').value !== ""
          ? parseFloat(form.querySelector('[name="amount"]').value)
          : null,
      expenseDate: form.querySelector('[name="expenseDate"]').value || null,
      vendorName:
        form.querySelector('[name="vendorName"]').value.trim() || null,
      notes: form.querySelector('[name="notes"]').value.trim() || null,
    };
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE}/events/${encodeURIComponent(currentEventId)}/expenses`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error();
      const created = await res.json();
      if (_edExpensesData === null) _edExpensesData = [];
      _edExpensesData.push(created);
      _edRenderExpenseList(list);
    } catch {
      newSaveBtn.textContent = "Save";
      newSaveBtn.disabled = false;
    }
  });

  // Collapse any open expense form
  document.querySelectorAll(".ed-expense-form").forEach((f) => {
    f.style.display = "none";
  });
  document
    .querySelectorAll(".ed-expense-row")
    .forEach((r) => r.classList.remove("pd-row--expanded"));
  const emptyEl = list.querySelector(".pd-empty-state");
  if (emptyEl) emptyEl.remove();
  list.querySelector(".ed-expense-totals")?.remove();
  list.prepend(row);
}

document
  .getElementById("ed-btn-add-expense")
  .addEventListener("click", () => _edAddNewExpenseRow());

// ── PAYROLL TAB ────────────────────────────────────────────────────────────

let _edPayrollData = null;

async function renderEdPayrollTab() {
  const root = document.getElementById("ed-payroll-root");
  if (!root) return;
  root.innerHTML = '<div class="pd-loading">Loading payroll…</div>';

  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/events/${encodeURIComponent(currentEventId)}/payroll`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error();
    _edPayrollData = await res.json();
    root.innerHTML = _edBuildPayrollHTML(_edPayrollData);
    _edWirePayrollSaveBtns();
  } catch {
    root.innerHTML = '<div class="pd-loading">Failed to load payroll.</div>';
  }
}

function _fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const date = d.toISOString().slice(0, 10);
  const time = d.toTimeString().slice(0, 5);
  return `${date}T${time}`;
}

function _fmtDuration(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const totalSecs = Math.round((new Date(endIso) - new Date(startIso)) / 1000);
  if (isNaN(totalSecs) || totalSecs < 0) return null;
  if (totalSecs < 60) return `${totalSecs}s`;
  const mins = Math.floor(totalSecs / 60);
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function _edBuildPayrollRowHTML(item, idx) {
  const hasApproved = item.approvedAt != null;
  const hasReported = item.actualStart || item.actualEnd;
  const duration = _fmtDuration(item.actualStart, item.actualEnd);
  const payStatus = item.paymentStatus || "pending";
  const _t = (iso) =>
    iso
      ? new Date(iso).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "—";

  // Hours status badge
  let hoursLabel, hoursCls;
  if (hasApproved) {
    hoursLabel = "Approved";
    hoursCls = "ed-badge--approved";
  } else if (hasReported) {
    hoursLabel = "Submitted";
    hoursCls = "ed-badge--pending";
  } else {
    hoursLabel = "Not Reported";
    hoursCls = "ed-badge--unpaid";
  }

  // Payment status badge
  let payLabel, payCls;
  if (payStatus === "paid") {
    payLabel = "Paid";
    payCls = "ed-badge--paid";
  } else if (payStatus === "approved") {
    payLabel = "Approved";
    payCls = "ed-badge--approved";
  } else {
    payLabel = "Pending";
    payCls = "ed-badge--unpaid";
  }

  const reportedHtml = hasReported
    ? `<span class="ed-pr-time-summary">${_t(item.actualStart)} – ${_t(item.actualEnd)}${duration ? ` (${duration})` : ""}</span>`
    : `<span class="ed-pr-not-reported">Not reported</span>`;

  const sectionAContent = hasReported
    ? `<div class="ed-pr-fields-row">
        <div class="ed-pr-field">
          <label class="ed-pr-field-label">Actual Arrival</label>
          <span class="ed-pr-field-val">${item.actualStart ? new Date(item.actualStart).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—"}</span>
        </div>
        <div class="ed-pr-field">
          <label class="ed-pr-field-label">Actual Departure</label>
          <span class="ed-pr-field-val">${item.actualEnd ? new Date(item.actualEnd).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—"}</span>
        </div>
        ${duration ? `<div class="ed-pr-field"><label class="ed-pr-field-label">Duration</label><span class="ed-pr-field-val ed-pr-field-val--strong">${escapeHtml(duration)}</span></div>` : ""}
      </div>`
    : `<p class="ed-pr-empty-state">Employee has not reported hours yet.</p>`;

  const approvedNote = hasApproved
    ? `<p class="ed-pr-approved-note">Approved on ${new Date(item.approvedAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</p>`
    : "";

  // Pre-fill pay rate from employee default if not yet set
  const payRateVal = item.payRatePerHour ?? item.defaultPayRate ?? "";

  return `
    <div class="ed-pr-employee-row" data-idx="${idx}">
      <div class="ed-pr-row-header">
        <div class="ed-pr-identity">
          <span class="ed-pr-name">${escapeHtml(item.firstName)} ${escapeHtml(item.lastName)}</span>
          <span class="ed-pr-role">${escapeHtml(item.roleName)}</span>
        </div>
        <div class="ed-pr-reported">${reportedHtml}</div>
        <div class="ed-pr-status-badges">
          <div class="ed-badge-group"><span class="ed-badge-label">Hours:</span><span class="ed-badge ${hoursCls}">${hoursLabel}</span></div>
          <div class="ed-badge-group"><span class="ed-badge-label">Pay:</span><span class="ed-badge ${payCls}">${payLabel}</span></div>
        </div>
        <button class="ed-pr-review-btn">Review</button>
      </div>
      <div class="ed-pr-panel" hidden>

        <!-- Step 1: Reported by Employee -->
        <div class="ed-pr-panel-section">
          <div class="ed-pr-panel-title"><span class="ed-pr-step-num">1</span> Employee Report</div>
          ${sectionAContent}
        </div>

        <!-- Step 2: Manager Approval -->
        <div class="ed-pr-panel-section">
          <div class="ed-pr-panel-title"><span class="ed-pr-step-num">2</span> Manager Approval</div>
          ${approvedNote}
          <div class="ed-pr-fields-row">
            <div class="ed-pr-field">
              <label class="ed-pr-field-label">Regular Hours</label>
              <input type="number" class="ed-pr-input ed-pr-input--sm" name="approvedRegularHours"
                     value="${item.approvedRegularHours ?? ""}" min="0" step="0.5" placeholder="—">
            </div>
          </div>
          <p class="ed-pr-ot-note">Overtime is calculated automatically (first 2h ×1.25, beyond ×1.50)</p>
          <button class="ed-pr-approve-btn" data-action="approve" data-idx="${idx}">Approve Hours</button>
        </div>

        <!-- Step 3: Payroll -->
        <div class="ed-pr-panel-section">
          <div class="ed-pr-panel-title"><span class="ed-pr-step-num">3</span> Payroll</div>
          <div class="ed-pr-fields-row">
            <div class="ed-pr-field">
              <label class="ed-pr-field-label">Rate/hr (₪)</label>
              <input type="number" class="ed-pr-input ed-pr-input--sm" name="payRatePerHour"
                     value="${payRateVal}" min="0" step="0.01" placeholder="—">
            </div>
            <div class="ed-pr-field">
              <label class="ed-pr-field-label">Travel Refund (₪)</label>
              <input type="number" class="ed-pr-input ed-pr-input--sm" name="travelRefund"
                     value="${item.travelRefund ?? ""}" min="0" step="0.01" placeholder="—">
            </div>
            <div class="ed-pr-field">
              <label class="ed-pr-field-label">Bonus (₪)</label>
              <input type="number" class="ed-pr-input ed-pr-input--sm" name="bonusAmount"
                     value="${item.bonusAmount ?? ""}" min="0" step="0.01" placeholder="—">
            </div>
            <div class="ed-pr-field">
              <label class="ed-pr-field-label">Penalty (₪)</label>
              <input type="number" class="ed-pr-input ed-pr-input--sm" name="penaltyAmount"
                     value="${item.penaltyAmount ?? ""}" min="0" step="0.01" placeholder="—">
            </div>
            <div class="ed-pr-field">
              <label class="ed-pr-field-label">Payment Status</label>
              <select class="ed-pr-input ed-pr-select" name="paymentStatus">
                ${["pending", "approved", "paid"]
                  .map(
                    (s) =>
                      `<option value="${s}"${payStatus === s ? " selected" : ""}>${capitalize(s)}</option>`,
                  )
                  .join("")}
              </select>
            </div>
          </div>
          <button class="ed-pr-save-btn" data-action="save" data-idx="${idx}">Save Payroll</button>
        </div>

      </div>
    </div>`;
}

function _edBuildPayrollHTML(items) {
  if (!items || items.length === 0) {
    return '<div class="pd-empty-state">No approved workers for payroll.</div>';
  }
  const rows = items
    .map((item, idx) => _edBuildPayrollRowHTML(item, idx))
    .join("");
  return `<div class="ed-pr-list">${rows}</div>`;
}

function _edWirePayrollSaveBtns() {
  const root = document.getElementById("ed-payroll-root");
  if (!root) return;

  // Use onclick (not addEventListener) so re-renders replace instead of stack listeners
  root.onclick = async (e) => {
    // Review button toggle
    if (e.target.closest(".ed-pr-review-btn")) {
      const row = e.target.closest(".ed-pr-employee-row");
      const panel = row?.querySelector(".ed-pr-panel");
      if (!panel) return;
      const isOpen = !panel.hidden;
      panel.hidden = isOpen;
      e.target.closest(".ed-pr-review-btn").textContent = isOpen
        ? "Review"
        : "Close";
      return;
    }

    // Approve or Save buttons
    const actionBtn = e.target.closest("[data-action]");
    if (!actionBtn) return;

    const idx = parseInt(actionBtn.dataset.idx, 10);
    const item = _edPayrollData[idx];
    const panel = actionBtn.closest(".ed-pr-panel");
    const val = (name) => panel.querySelector(`[name="${name}"]`)?.value ?? "";
    const num = (name) => (val(name) !== "" ? parseFloat(val(name)) : null);
    const action = actionBtn.dataset.action;

    actionBtn.disabled = true;
    actionBtn.textContent = "Saving…";

    try {
      const token = await getToken();
      let endpoint, body;

      if (action === "approve") {
        endpoint = `${API_BASE}/events/${encodeURIComponent(currentEventId)}/payroll/${encodeURIComponent(item.employeeUserId)}/${encodeURIComponent(item.shiftId)}/approve`;
        body = {
          approvedRegularHours: num("approvedRegularHours"),
        };
      } else {
        endpoint = `${API_BASE}/events/${encodeURIComponent(currentEventId)}/payroll/${encodeURIComponent(item.employeeUserId)}/${encodeURIComponent(item.shiftId)}/save`;
        body = {
          payRatePerHour: num("payRatePerHour"),
          travelRefund: num("travelRefund"),
          bonusAmount: num("bonusAmount"),
          penaltyAmount: num("penaltyAmount"),
          paymentStatus: val("paymentStatus") || "pending",
        };
      }

      const res = await fetch(endpoint, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();

      // Update data store and re-render the row in-place (keep panel open)
      _edPayrollData[idx] = updated;
      const row = root.querySelector(`.ed-pr-employee-row[data-idx="${idx}"]`);
      if (row) {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = _edBuildPayrollRowHTML(updated, idx);
        const newRow = tempDiv.firstElementChild;
        newRow.querySelector(".ed-pr-panel").hidden = false;
        newRow.querySelector(".ed-pr-review-btn").textContent = "Close";
        row.replaceWith(newRow);
      }
    } catch {
      actionBtn.textContent =
        action === "approve" ? "Approve Hours" : "Save Payroll";
      actionBtn.disabled = false;
    }
  };
}

// ── FINANCE TAB ────────────────────────────────────────────────────────────

async function renderEdFinanceTab() {
  const root = document.getElementById("ed-finance-root");
  if (!root) return;
  root.innerHTML = '<div class="pd-loading">Loading finance summary…</div>';

  try {
    const token = await getToken();
    const [payrollRes, expensesRes] = await Promise.all([
      fetch(
        `${API_BASE}/events/${encodeURIComponent(currentEventId)}/payroll`,
        { headers: { Authorization: `Bearer ${token}` } },
      ),
      fetch(
        `${API_BASE}/events/${encodeURIComponent(currentEventId)}/expenses`,
        { headers: { Authorization: `Bearer ${token}` } },
      ),
    ]);
    if (!payrollRes.ok || !expensesRes.ok) throw new Error();
    const payroll = await payrollRes.json();
    const expenses = await expensesRes.json();
    root.innerHTML = _edBuildFinanceHTML(payroll, expenses);
  } catch {
    root.innerHTML =
      '<div class="pd-loading">Failed to load finance data.</div>';
  }
}

function _edBuildFinanceHTML(payroll, expenses) {
  const fmt = (n) =>
    `₪${(n || 0).toLocaleString("en-IL", { minimumFractionDigits: 2 })}`;

  // Pull planned budget / expected revenue from cached event data
  const ev = (currentProjectDetail?.events ?? []).find(
    (e) => e.eventId === currentEventId,
  );
  const plannedBudget    = ev?.plannedBudget    ?? null;
  const expectedRevenue  = ev?.expectedRevenue  ?? null;

  // Finance only includes rows where hours are approved AND payment_status is approved or paid
  const financePayroll = (payroll ?? []).filter(
    (p) =>
      p.approvedAt &&
      (p.paymentStatus === "approved" || p.paymentStatus === "paid"),
  );

  // Labor cost per worker — Israeli law: first 8h regular, next 2h ×1.25, beyond ×1.50
  function calcLaborCost(totalHours, baseRate) {
    if (!totalHours || !baseRate) return { reg: 0, ot: 0 };
    const regHours = Math.min(totalHours, 8);
    const otHours = Math.max(0, totalHours - 8);
    const tier1 = Math.min(otHours, 2) * baseRate * 1.25;
    const tier2 = Math.max(0, otHours - 2) * baseRate * 1.5;
    return { reg: regHours * baseRate, ot: tier1 + tier2 };
  }

  let totalLabor = 0;
  const laborRows = financePayroll
    .map((p) => {
      const baseRate = p.payRatePerHour ?? p.defaultPayRate ?? 0;
      const totalHours =
        (p.approvedRegularHours ?? 0) + (p.approvedOvertimeHours ?? 0);
      const { reg, ot } = calcLaborCost(totalHours, baseRate);
      const travel = p.travelRefund ?? 0;
      const bonus = p.bonusAmount ?? 0;
      const penalty = p.penaltyAmount ?? 0;
      const total = reg + ot + travel + bonus - penalty;
      totalLabor += total;
      return `<tr>
      <td>${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</td>
      <td>${escapeHtml(p.roleName)}</td>
      <td>${fmt(reg)}</td>
      <td>${fmt(ot)} <span class='ed-fin-ot-note' title='First 2 OT hours ×1.25, beyond ×1.50 (Israeli law)'>⚖</span></td>
      <td>${fmt(travel + bonus - penalty)}</td>
      <td><strong>${fmt(total)}</strong></td>
    </tr>`;
    })
    .join("");

  // Expenses by type
  const byType = {};
  let totalExpenses = 0;
  (expenses ?? []).forEach((e) => {
    byType[e.expenseType] = (byType[e.expenseType] ?? 0) + (e.amount ?? 0);
    totalExpenses += e.amount ?? 0;
  });
  const expenseRows = Object.entries(byType)
    .map(
      ([type, amt]) =>
        `<tr><td>${escapeHtml(type)}</td><td>${fmt(amt)}</td></tr>`,
    )
    .join("");

  if (financePayroll.length === 0 && Object.keys(byType).length === 0) {
    return '<div class="pd-empty-state">No finance-ready records yet. Hours must be approved and payment status set to Approved or Paid.</div>';
  }

  const grandTotal = totalLabor + totalExpenses;

  const profitLoss = (expectedRevenue ?? 0) - grandTotal;
  const profitCls  = profitLoss >= 0 ? "ed-finance-card--profit" : "ed-finance-card--loss";

  return `
    <div class="ed-finance-cards">
      ${plannedBudget  !== null ? `<div class="ed-finance-card ed-finance-card--plan"><div class="ed-finance-card-label">Planned Budget</div><div class="ed-finance-card-value">${fmt(plannedBudget)}</div></div>` : ""}
      ${expectedRevenue !== null ? `<div class="ed-finance-card ed-finance-card--rev"><div class="ed-finance-card-label">Expected Revenue</div><div class="ed-finance-card-value">${fmt(expectedRevenue)}</div></div>` : ""}
      <div class="ed-finance-card">
        <div class="ed-finance-card-label">Total Labor Cost</div>
        <div class="ed-finance-card-value">${fmt(totalLabor)}</div>
      </div>
      <div class="ed-finance-card">
        <div class="ed-finance-card-label">Total Expenses</div>
        <div class="ed-finance-card-value">${fmt(totalExpenses)}</div>
      </div>
      <div class="ed-finance-card ed-finance-card--total">
        <div class="ed-finance-card-label">Grand Total Cost</div>
        <div class="ed-finance-card-value">${fmt(grandTotal)}</div>
      </div>
      ${expectedRevenue !== null ? `<div class="ed-finance-card ${profitCls}"><div class="ed-finance-card-label">Profit / Loss</div><div class="ed-finance-card-value">${profitLoss >= 0 ? "+" : ""}${fmt(profitLoss)}</div></div>` : ""}
    </div>

    ${
      payroll.length > 0
        ? `
    <div class="ed-finance-section">
      <h4 class="ed-finance-section-title">Labor Breakdown</h4>
      <table class="ed-worker-table">
        <thead><tr><th>Employee</th><th>Role</th><th>Regular</th><th>Overtime</th><th>Extras</th><th>Total</th></tr></thead>
        <tbody>${laborRows}</tbody>
        <tfoot><tr><td colspan="5"><strong>Total Labor</strong></td><td><strong>${fmt(totalLabor)}</strong></td></tr></tfoot>
      </table>
    </div>`
        : ""
    }

    ${
      expenses.length > 0
        ? `
    <div class="ed-finance-section">
      <h4 class="ed-finance-section-title">Expenses by Category</h4>
      <table class="ed-worker-table">
        <thead><tr><th>Category</th><th>Amount</th></tr></thead>
        <tbody>${expenseRows}</tbody>
        <tfoot><tr><td><strong>Total Expenses</strong></td><td><strong>${fmt(totalExpenses)}</strong></td></tr></tfoot>
      </table>
    </div>`
        : ""
    }`;
}
