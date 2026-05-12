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
import { initChat, destroyChat, openChatWith, openEventChat, openShiftChat } from "./chat-ui.js";
import { initI18n, applyTranslations, getCurrentLanguage, _t } from "./i18n.js";

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
initI18n();

window.addEventListener("teamgle:languagechange", () => {
  applyTranslations();
  const activeSection = document.querySelector(".page-section:not([style*='display:none'])")?.dataset.section;
  if (activeSection === "events") renderProjectsKanban(_applyProjectFilters(_allProjects ?? []));
  if (activeSection === "event-detail" && currentEventId) activateEventTab(
    document.querySelector("#event-detail-tabs .pd-tab.active")?.dataset.etab ?? "staffing",
  );
  if (activeSection === "chats") {
    destroyChat();
    chatInitialized = false;
    _initChatSection();
  }
});

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
const _eventChatWorkers = new Map();

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
    alert(_t("Access denied. Manager accounts only.", "גישה נדחתה. חשבונות מנהלים בלבד."));
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
  activateSection("events");
});

// ── Token helper (auto-refresh) ────────────────────────────────────────────
async function getToken(forceRefresh = false) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated.");
  return await user.getIdToken(forceRefresh);
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
  const q         = (document.getElementById("employee-search")?.value ?? "").trim().toLowerCase();
  const statusVal = (document.getElementById("emp-filter-status")?.value ?? "").toLowerCase();

  const hasFilter = q || statusVal;
  const clearBtn  = document.getElementById("emp-filter-clear");
  if (clearBtn) clearBtn.style.display = hasFilter ? "" : "none";

  return list.filter((e) => {
    if (q) {
      const full = `${e.firstName} ${e.lastName}`.toLowerCase();
      if (!full.includes(q) && !e.firstName.toLowerCase().includes(q) && !e.lastName.toLowerCase().includes(q)) return false;
    }
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
document.getElementById("emp-filter-status")?.addEventListener("change", () => {
  renderEmployees(filterEmployees(allEmployees));
});
document.getElementById("emp-filter-clear")?.addEventListener("click", () => {
  const s = document.getElementById("employee-search");
  const st = document.getElementById("emp-filter-status");
  if (s) s.value = "";
  if (st) st.value = "";
  renderEmployees(filterEmployees(allEmployees));
});

document.getElementById("customer-search")?.addEventListener("input", () => {
  renderCustomers(filterCustomers(allCustomers));
});

// ── Load employees ─────────────────────────────────────────────────────────
async function loadEmployees() {
  employeeTbody.innerHTML = `<tr><td colspan="7" class="empty-state">${_t("Loading…", "טוען…")}</td></tr>`;
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/employees`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to load employees.");
    allEmployees = await res.json();
    renderEmployees(filterEmployees(allEmployees));
  } catch {
    employeeTbody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:#ef4444">${_t("Failed to load employees.", "טעינת עובדים נכשלה.")}</td></tr>`;
  }
}

function renderEmployees(employees) {
  if (!employees.length) {
    employeeTbody.innerHTML = `<tr><td colspan="7" class="empty-state">${_t('No employees yet. Click "+ Add Employee" to get started.', 'אין עובדים עדיין. לחץ על "+ הוסף עובד" להתחלה.')}</td></tr>`;
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

  document.getElementById("modal-title").textContent = _t("Edit Employee", "ערוך עובד");
  btnSave.innerHTML = `${_ICON.check} ${_t("Save Changes", "שמור שינויים")}`;
  delete btnSave.dataset.origHtml;
  empEmail.disabled = true;
  empEmail.style.opacity = "0.6";

  modalOverlay.classList.add("open");

  // Show loading state while fetching
  btnSave.disabled = true;
  btnSave.textContent = _t("Loading…", "טוען…");

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
  document.getElementById("modal-title").textContent = _t("Add New Employee", "הוסף עובד חדש");
  btnSave.innerHTML = `${_ICON.check} ${_t("Save Employee", "שמור עובד")}`;
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
    showError(_t("First and last name are required.", "שם פרטי ושם משפחה הם שדות חובה."));
    return;
  }
  if (!editingEmployeeId && (!email || !isValidEmail(email))) {
    showError(_t("A valid email address is required.", "נדרשת כתובת אימייל תקינה."));
    return;
  }
  if (isNaN(costPerHour) || costPerHour < 0) {
    showError(_t("Cost per hour must be a valid positive number.", "עלות לשעה חייבת להיות מספר חיובי תקין."));
    return;
  }
  if (!roleIds.length) {
    showError(_t("Please select at least one role.", "יש לבחור לפחות תפקיד אחד."));
    return;
  }

  const incompleteDocs = documentFiles.filter(
    (d) => d && (d.file || d.title) && !(d.file && d.title),
  );
  if (incompleteDocs.length > 0) {
    showError(
      _t("Please select a title and a file for every document row, or remove incomplete rows.", "יש לבחור כותרת וקובץ לכל שורת מסמך, או להסיר שורות לא שלמות."),
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
  btn.textContent = _t("Saving…", "שומר…");

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
    btn.textContent = _t("Saving…", "שומר…");
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
  if (name === "events") {
    _initProjectFilters();
    loadProjects();
  }
  if (name === "create-event") loadProjectCustomerDropdown();
  if (name === "chats") _initChatSection();
  if (name === "invoices") loadInvoices();
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
      const start = p.startTime ? new Date(p.startTime) : null;
      const end = p.endTime ? new Date(p.endTime) : null;
      if (_filterDateFrom && end && end < _filterDateFrom) return false;
      if (_filterDateTo && start && start > _filterDateTo) return false;
      return true;
    });
  }

  if (_filterStatuses.size > 0) {
    projects = projects.filter((p) =>
      _filterStatuses.has(p.displayStatus),
    );
  }

  const q = document.getElementById("search-projects")?.value.trim().toLowerCase();
  if (q) {
    projects = projects.filter((p) => (p.name || "").toLowerCase().includes(q));
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
  };

  Object.values(cols).forEach((col) => {
    col.innerHTML = `<div class="empty-col">Loading…</div>`;
  });

  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/events`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to load events.");
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
  };

  const buckets = { today: [], upcoming: [], completed: [] };

  for (const p of projects) {
    switch (p.displayStatus) {
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
      : `<div class="empty-col">No events</div>`;
  }
}


function renderProjectCard(project) {
  const statusMap = {
    draft:     { label: _t("Draft",     "טיוטה"),    cls: "badge-pending"  },
    planning:  { label: _t("Planning",  "תכנון"),    cls: "badge-info"     },
    active:    { label: _t("Active",    "פעיל"),     cls: "badge-active"   },
    completed: { label: _t("Completed", "הושלם"),   cls: "badge-success"  },
    canceled:  { label: _t("Canceled",  "בוטל"),    cls: "badge-error"    },
  };
  const badge = statusMap[project.displayStatus] ?? {
    label: project.displayStatus,
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
    : _t("No customer", "ללא לקוח");

  return `
    <div class="event-card"
         data-event-id="${escapeHtml(project.eventId)}"
         role="button"
         tabindex="0"
         aria-label="${escapeHtml(_t("Open event", "פתח אירוע"))}: ${escapeHtml(project.name)}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
        <span class="event-status-badge ${badge.cls}">${badge.label}</span>
      </div>
      <div class="event-title">${escapeHtml(project.name)}</div>
      <div class="event-meta">
        <span class="material-symbols-outlined" style="font-size:13px">calendar_month</span>
        ${fmt(project.startTime)} – ${fmt(project.endTime)}
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
  _applyProjectFilters();
});

document.getElementById("btn-create-project").addEventListener("click", () => {
  activateSection("create-event");
  initCreateEventForm();
});

function _openEventCard(card) {
  if (!card) return;
  const evData = (_allProjects ?? []).find((p) => p.eventId === card.dataset.eventId);
  openEventDetail(card.dataset.eventId, evData ?? null);
}

// ── Click/tap on kanban card → open event detail ───────────────────────────
document.querySelector(".events-kanban").addEventListener("click", (e) => {
  const card = e.target.closest(".event-card[data-event-id]");
  if (!card) return;
  _openEventCard(card);
});

document.querySelector(".events-kanban").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const card = e.target.closest(".event-card[data-event-id]");
  if (!card) return;
  e.preventDefault();
  _openEventCard(card);
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
document.querySelectorAll("#section-project-detail .pd-tab[data-tab]").forEach((tab) => {
  tab.addEventListener("click", () => activateProjectTab(tab.dataset.tab));
});

function activateProjectTab(name) {
  _stopStaffingPoll();
  document.querySelectorAll("#section-project-detail .pd-tab[data-tab]").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === name);
  });
  document.querySelectorAll("#section-project-detail .pd-panel[data-tab-panel]").forEach((p) => {
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
    subtitleEl.textContent = `${project.displayStatus ?? project.status} · ${project.eventCount} event${project.eventCount !== 1 ? "s" : ""}`;
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
    planning:  { label: _t("Planning",  "תכנון"),   cls: "ev-status--planning"  },
    active:    { label: _t("Active",    "פעיל"),    cls: "ev-status--active"    },
    completed: { label: _t("Completed", "הושלם"),  cls: "ev-status--completed" },
    canceled:  { label: _t("Canceled",  "בוטל"),   cls: "ev-status--canceled"  },
  };
  const typeMeta = {
    conference: { icon: "groups",       label: _t("Conference", "כנס")       },
    exhibition: { icon: "store",        label: _t("Exhibition", "תערוכה")    },
    concert:    { icon: "music_note",   label: _t("Concert",    "קונצרט")    },
    gala:       { icon: "celebration",  label: _t("Gala",       "גאלה")      },
    corporate:  { icon: "business",     label: _t("Corporate",  "ארגוני")    },
    wedding:    { icon: "favorite",     label: _t("Wedding",    "חתונה")     },
    workshop:   { icon: "construction", label: _t("Workshop",   "סדנה")      },
    seminar:    { icon: "school",       label: _t("Seminar",    "סמינר")     },
    other:      { icon: "event",        label: _t("Event",      "אירוע")     },
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
            ? _t("Same day", "אותו יום")
            : _t(`${duration} day${duration !== 1 ? "s" : ""}`, `${duration} יום${duration !== 1 ? "ים" : ""}`)
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
          <h3 class="ev-card-title">${escapeHtml(ev.name || _t("Untitled Event", "אירוע ללא שם"))}</h3>
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
    renderGantt(schedule, container);
  } catch {
    container.innerHTML = `
      <div class="pd-placeholder" style="color:var(--red)">
        <span class="material-symbols-outlined" style="font-size:40px;margin-bottom:8px">error</span>
        Failed to load schedule.
      </div>`;
  }
}

async function loadEventSchedule(eventId) {
  const container = document.getElementById("ed-gantt-container");
  if (!container) return;
  container.innerHTML = `
    <div class="pd-placeholder">
      <span class="material-symbols-outlined" style="font-size:40px;margin-bottom:8px">hourglass_top</span>
      Loading schedule…
    </div>`;
  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/events/${encodeURIComponent(eventId)}/schedule`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error("Failed to load schedule.");
    const eventSchedule = await res.json();
    _eventScheduleCache.set(eventId, eventSchedule);
    renderGantt({ events: [eventSchedule] }, container);
  } catch {
    container.innerHTML = `
      <div class="pd-placeholder" style="color:var(--red)">
        <span class="material-symbols-outlined" style="font-size:40px;margin-bottom:8px">error</span>
        Failed to load schedule.
      </div>`;
  }
}

function renderGantt(schedule, container) {
  if (!container) container = document.getElementById("gantt-container");

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

      const mobileRowsHtml =
        ev.shifts.length === 0
          ? `<div class="gantt-mobile-empty">${_t("No shifts defined for this event", "לא הוגדרו משמרות לאירוע הזה")}</div>`
          : ev.shifts
              .map((shift) => {
                const time = `${fmtTime(shift.startTime)}${shift.endTime ? `-${fmtTime(shift.endTime)}` : ""}`;
                return `
            <div class="gantt-mobile-shift">
              <div class="gantt-mobile-main">
                <span class="gantt-mobile-role">${escapeHtml(shift.roleName)}</span>
                <span class="gantt-mobile-time">${escapeHtml(time || "—")}</span>
              </div>
              <span class="gantt-mobile-count">${escapeHtml(String(shift.staffedCount ?? 0))}/${escapeHtml(String(shift.requiredQuantity ?? 0))}</span>
              <div class="gantt-mobile-actions">
                <button class="gantt-bar-btn gantt-bar-btn-edit" type="button" title="${_t("Edit shift", "ערוך משמרת")}"
                        data-shift-id="${escapeHtml(shift.shiftId)}"
                        data-role-id="${escapeHtml(shift.roleId)}"
                        data-start="${shift.startTime ? toLocalDateTimeInput(shift.startTime) : ""}"
                        data-end="${shift.endTime ? toLocalDateTimeInput(shift.endTime) : ""}"
                        data-qty="${shift.requiredQuantity}">
                  <i data-lucide="pencil" style="width:14px;height:14px"></i>
                </button>
                <button class="gantt-bar-btn gantt-bar-btn-delete" type="button" title="${_t("Delete shift", "מחק משמרת")}"
                        data-shift-id="${escapeHtml(shift.shiftId)}">
                  <i data-lucide="trash-2" style="width:14px;height:14px"></i>
                </button>
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
        <div class="gantt-mobile-list">
          ${mobileRowsHtml}
        </div>
        <div class="gantt-footer">
          <button class="btn-add-shift-gantt" type="button"
                  data-event-id="${escapeHtml(ev.eventId)}"
                  data-event-date="${ev.startTime ? _splitIsoToLocalParts(ev.startTime).date : ""}"
                  data-event-start-time="${ev.startTime ? _splitIsoToLocalParts(ev.startTime).time : ""}"
                  data-event-end-time="${ev.endTime ? _splitIsoToLocalParts(ev.endTime).time : ""}">${_t("+ Add Shift", "+ הוסף משמרת")}</button>
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
      newSaveBtn.textContent = _t("Save", "שמור");
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
  root.innerHTML = `<div class="pd-loading">${_t("Loading project finances…", "טוען כספי פרויקט…")}</div>`;

  const events = currentProjectDetail?.events ?? [];
  if (events.length === 0) {
    root.innerHTML = `<div class="pd-empty-state">${_t("No events in this project yet.", "אין עדיין אירועים בפרויקט הזה.")}</div>`;
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
        ${totalPlanned  > 0 ? `<div class="ed-finance-card ed-finance-card--plan"><div class="ed-finance-card-label">${_t("Total Planned Budget", "סה\"כ תקציב מתוכנן")}</div><div class="ed-finance-card-value">${fmt(totalPlanned)}</div></div>` : ""}
        ${totalRevenue  > 0 ? `<div class="ed-finance-card ed-finance-card--rev"><div class="ed-finance-card-label">${_t("Total Expected Revenue", "סה\"כ הכנסה צפויה")}</div><div class="ed-finance-card-value">${fmt(totalRevenue)}</div></div>` : ""}
        <div class="ed-finance-card"><div class="ed-finance-card-label">${_t("Total Labor Cost", "עלות עבודה כוללת")}</div><div class="ed-finance-card-value">${fmt(totalLabor)}</div></div>
        <div class="ed-finance-card"><div class="ed-finance-card-label">${_t("Total Expenses", "סה\"כ הוצאות")}</div><div class="ed-finance-card-value">${fmt(totalExpenses)}</div></div>
        <div class="ed-finance-card ed-finance-card--total"><div class="ed-finance-card-label">${_t("Grand Total Cost", "עלות כוללת")}</div><div class="ed-finance-card-value">${fmt(grandTotal)}</div></div>
        ${totalRevenue > 0 ? `<div class="ed-finance-card ${profitCls}"><div class="ed-finance-card-label">${_t("Profit / Loss", "רווח / הפסד")}</div><div class="ed-finance-card-value">${profitTotal >= 0 ? "+" : ""}${fmt(profitTotal)}</div></div>` : ""}
      </div>
      <div class="ed-finance-section">
        <h4 class="ed-finance-section-title">${_t("Breakdown by Event", "פירוט לפי אירוע")}</h4>
        <table class="ed-worker-table">
          <thead><tr><th>${_t("Event", "אירוע")}</th><th>${_t("Budget", "תקציב")}</th><th>${_t("Revenue", "הכנסה")}</th><th>${_t("Labor", "עבודה")}</th><th>${_t("Expenses", "הוצאות")}</th><th>${_t("Total Cost", "עלות כוללת")}</th><th>${_t("P/L", "רווח/הפסד")}</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr>
            <td><strong>${_t("Total", "סה\"כ")}</strong></td>
            <td>${totalPlanned  > 0 ? fmt(totalPlanned)  : "—"}</td>
            <td>${totalRevenue  > 0 ? fmt(totalRevenue)  : "—"}</td>
            <td>${fmt(totalLabor)}</td>
            <td>${fmt(totalExpenses)}</td>
            <td><strong>${fmt(grandTotal)}</strong></td>
            <td class="${profitCls}">${totalRevenue > 0 ? `${profitTotal >= 0 ? "+" : ""}${fmt(profitTotal)}` : "—"}</td>
          </tr></tfoot>
        </table>
      </div>`;

    // Append invoice block
    const projId   = currentProjectDetail?.projId;
    const invoices = projId ? await _invFetchForProject(projId) : [];
    root.innerHTML += _invBuildFinanceBlock(invoices, { createBtnId: "pd-inv-create-btn", context: "project" });
    lucide.createIcons();

    document.getElementById("pd-inv-create-btn")?.addEventListener("click", () => {
      openInvoiceModal({
        prefillProjectId:  projId,
        prefillCustomerId: currentProjectDetail?.customerId,
      });
    });
  } catch {
    root.innerHTML = `<div class="pd-loading">${_t("Failed to load finance data.", "טעינת נתוני כספים נכשלה.")}</div>`;
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

  const ackHtml =
    brief.totalRelevant > 0
      ? `<span class="ed-brief-ack${brief.ackCount >= brief.totalRelevant ? " ed-brief-ack--all" : ""}" title="${brief.ackCount} of ${brief.totalRelevant} acknowledged">&#10003; ${brief.ackCount} / ${brief.totalRelevant}</span>`
      : "";

  row.innerHTML = `
    <div class="pd-row-summary">
      <div class="pd-brief-summary">
        <span class="pd-brief-title-text">${escapeHtml(brief.title)}</span>
        <span class="pd-brief-preview-text">${escapeHtml(preview)}</span>
        <span class="pd-brief-author-text">Created by: ${escapeHtml(authorName)}${dateStr ? ` · ${dateStr}` : ""}${ackHtml}</span>
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

    // Load acknowledgments (once)
    const ackListEl = form.querySelector(".ed-brief-ack-list");
    if (ackListEl && ackListEl.innerHTML === "") {
      ackListEl.innerHTML = '<span class="ed-ack-loading">Loading…</span>';
      getToken().then((token) =>
        fetch(
          `${API_BASE}/projects/${encodeURIComponent(currentProjectDetail.projId)}/briefs/${encodeURIComponent(brief.briefId)}/acknowledgments`,
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
              if (headerEl) headerEl.textContent = `Acknowledgments — ${readCount} / ${total}`;
              ackListEl.innerHTML = acks
                .map(
                  (a) => `
              <div class="ed-ack-item${a.isRead ? " ed-ack-item--read" : ""}">
                <span class="ed-ack-name">${escapeHtml(a.firstName)} ${escapeHtml(a.lastName)}</span>
                ${a.isRead
                    ? `<span class="ed-ack-badge">&#10003; ${a.readAt ? formatBriefDate(a.readAt) : "Acknowledged"}</span>`
                    : `<span class="ed-ack-pending">Pending</span>`}
              </div>`,
                )
                .join("");
            }
          })
          .catch(() => {
            ackListEl.innerHTML = '<span class="ed-ack-empty">Failed to load.</span>';
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
  return `<div class="pd-empty-state">${_t("No briefs yet. Start by adding your first brief.", "אין תדריכים עדיין. התחל בהוספת התדריך הראשון.")}</div>`;
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
      newSaveBtn.textContent = _t("Save", "שמור");
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
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">${_t('No customers yet. Click "+ Add Customer" to get started.', 'אין לקוחות עדיין. לחץ על "+ הוסף לקוח" להתחלה.')}</td></tr>`;
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
    _t("Add New Customer", "הוסף לקוח חדש");
  const btn = document.getElementById("btn-save-customer");
  btn.innerHTML = `${_ICON.check} ${_t("Save Customer", "שמור לקוח")}`;
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
      _t("Edit Customer", "ערוך לקוח");
    const btn = document.getElementById("btn-save-customer");
    btn.textContent = _t("Loading…", "טוען…");
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
      errorEl.textContent = _t("Company name is required.", "שם חברה הוא שדה חובה.");
      errorEl.style.display = "block";
      return;
    }

    const incompleteCustDocs = custDocumentFiles.filter(
      (d) => d && (d.file || d.title) && !(d.file && d.title),
    );
    if (incompleteCustDocs.length > 0) {
      errorEl.textContent =
        _t("Please select a title and a file for every document row, or remove incomplete rows.", "יש לבחור כותרת וקובץ לכל שורת מסמך, או להסיר שורות לא שלמות.");
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
    btn.textContent = _t("Saving…", "שומר…");

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
    document.getElementById("contact-form-title").textContent = _t("Edit Contact", "ערוך איש קשר");
    const btn = document.getElementById("btn-save-contact");
    btn.textContent = _t("Loading…", "טוען…");
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
    btn.textContent = _t("Saving…", "שומר…");

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
// ── CREATE EVENT FORM ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

let projectEventCounter = 0; // monotonic counter for unique shift block IDs
let cachedRoles = []; // roles loaded once per session

function revalidateEventDates() {
  // no-op: no project-level date range in standalone event form
}

function _splitDateTimeLocal(value) {
  if (!value) return { date: "", time: "" };
  const [date, time = ""] = value.split("T");
  return { date, time: time.slice(0, 5) };
}

function _splitIsoToLocalParts(iso) {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function _prefillShiftRowFromStandaloneEvent(row, { force = false } = {}) {
  const start = _splitDateTimeLocal(document.getElementById("ev-start-time")?.value || "");
  const end   = _splitDateTimeLocal(document.getElementById("ev-end-time")?.value   || "");

  const setIfEmpty = (selector, value) => {
    const input = row.querySelector(selector);
    if (input && value && (force || !input.value)) input.value = value;
  };

  setIfEmpty(".shift-start-date", start.date);
  setIfEmpty(".shift-start-time", start.time);
  setIfEmpty(".shift-end-date",   end.date || start.date);
  setIfEmpty(".shift-end-time",   end.time);
}

function _prefillEmptyStandaloneShiftRows() {
  document
    .querySelectorAll("#section-create-event #events-container .shift-row")
    .forEach((row) => _prefillShiftRowFromStandaloneEvent(row));
}

document.getElementById("ev-start-time")?.addEventListener("change", _prefillEmptyStandaloneShiftRows);
document.getElementById("ev-end-time")?.addEventListener("change", _prefillEmptyStandaloneShiftRows);

// ── Back button ────────────────────────────────────────────────────────────
document
  .getElementById("btn-back-to-projects")
  .addEventListener("click", () => {
    activateSection("events");
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
      errBanner.textContent = "Event name is required.";
      errBanner.classList.add("visible");
      return;
    }

    const startTime = document.getElementById("ev-start-time").value || null;
    const endTime   = document.getElementById("ev-end-time").value   || null;
    const customerId = document.getElementById("proj-customer").value || null;

    const btn = document.getElementById("btn-save-draft");
    btn.disabled = true;
    btn.textContent = _t("Saving…", "שומר…");

    try {
      const token = await getToken(true);
      const res = await fetch(`${API_BASE}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          startTime: startTime ? new Date(startTime).toISOString() : new Date().toISOString(),
          endTime:   endTime   ? new Date(endTime).toISOString()   : new Date().toISOString(),
          customerId,
          status: "draft",
          shifts: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        errBanner.textContent = res.status === 401
          ? "Your session expired. Please sign out and sign in again."
          : (data.error || "Failed to save draft.");
        errBanner.classList.add("visible");
        return;
      }
      activateSection("events");
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

// ── ＋ Add Shift button (standalone event form) ───────────────────────────
document.getElementById("btn-add-event").addEventListener("click", async () => {
  const roles = await ensureRolesLoaded();
  appendStandaloneShiftRow(roles);
});

async function appendStandaloneShiftRow(roles) {
  if (!roles) roles = await ensureRolesLoaded();
  const container = document.getElementById("events-container");
  if (!container) return;

  const roleOptions = roles.length
    ? roles.map((r) => `<option value="${r.rollId}">${escapeHtml(r.rollName)}</option>`).join("")
    : `<option value="">No roles available</option>`;

  const row = document.createElement("div");
  row.className = "shift-row";
  row.innerHTML = `
    <div class="field">
      <label>${_t("Role", "תפקיד")} *</label>
      <select>
        <option value="">${_t("— Select role —", "— בחר תפקיד —")}</option>
        ${roleOptions}
      </select>
    </div>
    <div class="field">
      <label>${_t("Qty", "כמות")} *</label>
      <input type="number" placeholder="1" min="1" value="1" />
    </div>
    <div class="field datetime-field">
      <label>${_t("Start", "התחלה")} *</label>
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
    <button class="btn-remove-shift" type="button" title="Remove shift">
      <i data-lucide="x"></i>
    </button>
  `;
  row.querySelector(".btn-remove-shift").addEventListener("click", () => row.remove());
  container.appendChild(row);
  _prefillShiftRowFromStandaloneEvent(row);
  if (window.lucide) lucide.createIcons();
}

// ── Collapse All / Expand All events ──────────────────────────────────────
document.getElementById("btn-collapse-events")?.addEventListener("click", () => {
  const blocks = document.querySelectorAll(".event-block");
  const anyExpanded = [...blocks].some(
    (b) => !b.classList.contains("collapsed"),
  );
  blocks.forEach((b) => b.classList.toggle("collapsed", anyExpanded));
  updateCollapseAllBtn();
});

// ── Initialise the form (called when navigating to create-event) ───────────
function initCreateEventForm() {
  document.getElementById("proj-name").value = "";
  document.getElementById("ev-start-time").value = "";
  document.getElementById("ev-end-time").value = "";
  document.getElementById("ev-location").value = "";
  document.getElementById("ev-type").value = "";
  document.getElementById("ev-attendees").value = "";
  document.getElementById("ev-budget").value = "";
  document.getElementById("ev-revenue").value = "";
  document.getElementById("proj-customer").value = "";
  ["field-proj-name", "field-ev-start", "field-ev-end"].forEach((id) =>
    document.getElementById(id)?.classList.remove("has-error"),
  );

  const errBanner = document.getElementById("create-project-error");
  errBanner.textContent = "";
  errBanner.classList.remove("visible");

  projectEventCounter = 0;
  document.getElementById("events-container").innerHTML = "";
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
    const cpSection = document.getElementById("section-create-event");
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
        <span class="event-block-icon"><i data-lucide="calendar-clock"></i></span>
        <span class="event-block-label">Event ${idx}</span>
        <span class="event-block-summary" id="event-summary-${idx}"></span>
      </div>
      <button class="btn-remove-block" type="button" title="Remove event" data-remove-event="${idx}" aria-label="Remove event">
        <i data-lucide="x"></i>
      </button>
    </div>
    <div class="event-block-body">
      <div class="event-edit-section">
        <p class="form-group-title">
          <span class="form-group-icon"><i data-lucide="map-pin"></i></span>
          Event Details
        </p>
        <div class="field" data-field="event-name-${idx}">
          <label>Event Name <span class="req">*</span></label>
          <input type="text" id="event-name-${idx}" placeholder="Cocktail Hour" autocomplete="off" />
        </div>
        <div class="create-event-two-col">
          <div class="field">
            <label>Location</label>
            <input type="text" id="event-location-${idx}" placeholder="Grand Ballroom" autocomplete="off" />
          </div>
          <div class="field">
            <label>Event Type</label>
            <select id="event-type-${idx}">
              <option value="">Select type</option>
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
        </div>
      </div>

      <div class="event-edit-section">
        <p class="form-group-title">
          <span class="form-group-icon"><i data-lucide="clock"></i></span>
          Schedule
        </p>
        <div class="create-event-two-col">
          <div class="field datetime-field create-date-card" data-field="event-start-date-${idx}">
            <label>Start <span class="req">*</span></label>
            <div class="datetime-group">
              <input type="date" id="event-start-date-${idx}" class="dt-date" />
              <input type="time" id="event-start-time-${idx}" class="dt-time" step="300" />
            </div>
          </div>
          <div class="field datetime-field create-date-card" data-field="event-end-date-${idx}">
            <label>End <span class="req">*</span></label>
            <div class="datetime-group">
              <input type="date" id="event-end-date-${idx}" class="dt-date" />
              <input type="time" id="event-end-time-${idx}" class="dt-time" step="300" />
            </div>
          </div>
        </div>
      </div>

      <div class="event-edit-section">
        <p class="form-group-title">
          <span class="form-group-icon"><i data-lucide="wallet"></i></span>
          Planning Numbers
        </p>
        <div class="create-event-three-col">
          <div class="field">
            <label>Attendees</label>
            <input type="number" id="event-attendees-${idx}" placeholder="0" min="0" />
          </div>
          <div class="field">
            <label>Planned Budget</label>
            <input type="number" id="event-budget-${idx}" placeholder="0.00" min="0" step="0.01" />
          </div>
          <div class="field">
            <label>Expected Revenue</label>
            <input type="number" id="event-revenue-${idx}" placeholder="0.00" min="0" step="0.01" />
          </div>
        </div>
      </div>

      <!-- Shifts sub-section -->
      <div class="shifts-subsection">
        <div class="shifts-subheader">
          <span class="shifts-subheader-label"><i data-lucide="users"></i> ${_t("Shifts", "משמרות")}</span>
          <button class="btn-add-shift btn-with-icon" type="button" data-add-shift="${idx}">
            <i data-lucide="plus"></i>
            ${_t("Add Shift", "הוסף משמרת")}
          </button>
        </div>
        <div class="shifts-col-headers">
          <span>${_t("Role", "תפקיד")}</span>
          <span>${_t("Qty", "כמות")}</span>
          <span>${_t("Start (date & time)", "התחלה (תאריך ושעה)")}</span>
          <span>${_t("End (date & time)", "סיום (תאריך ושעה)")}</span>
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

  // Revalidate so new block is checked immediately
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
      <label>${_t("Role", "תפקיד")} *</label>
      <select>
        <option value="">${_t("— Select role —", "— בחר תפקיד —")}</option>
        ${roleOptions}
      </select>
    </div>
    <div class="field">
      <label>${_t("Qty", "כמות")} *</label>
      <input type="number" placeholder="1" min="1" value="1" />
    </div>
    <div class="field datetime-field">
      <label>${_t("Start", "התחלה")} *</label>
      <div class="datetime-group">
        <input type="date" class="dt-date shift-start-date" />
        <input type="time" class="dt-time shift-start-time" step="300" />
      </div>
    </div>
    <div class="field datetime-field">
      <label>${_t("End", "סיום")} *</label>
      <div class="datetime-group">
        <input type="date" class="dt-date shift-end-date" />
        <input type="time" class="dt-time shift-end-time" step="300" />
      </div>
    </div>
    <button class="btn-remove-shift" type="button" title="${_t("Remove shift", "הסר משמרת")}" aria-label="${_t("Remove shift", "הסר משמרת")}">
      <i data-lucide="x"></i>
    </button>
  `;

  row
    .querySelector(".btn-remove-shift")
    .addEventListener("click", () => row.remove());

  list.appendChild(row);
  _prefillShiftRowFromStandaloneEvent(row);
  if (window.lucide) lucide.createIcons();
}

// ── Collect all form data into a CreateProjectRequest object ──────────────
function collectEventFormData() {
  let valid = true;

  document
    .querySelectorAll(".field.has-error")
    .forEach((f) => f.classList.remove("has-error"));
  const errBanner = document.getElementById("create-project-error");
  errBanner.textContent = "";
  errBanner.classList.remove("visible");

  const showError = (msg) => {
    if (!errBanner.classList.contains("visible")) {
      errBanner.textContent = msg;
      errBanner.classList.add("visible");
    }
    valid = false;
  };

  const name = document.getElementById("proj-name").value.trim();
  const startTimeVal = document.getElementById("ev-start-time").value;
  const endTimeVal   = document.getElementById("ev-end-time").value;
  const location     = document.getElementById("ev-location").value.trim() || null;
  const eventType    = document.getElementById("ev-type").value.trim() || null;
  const attendees    = document.getElementById("ev-attendees").value;
  const budget       = document.getElementById("ev-budget").value;
  const revenue      = document.getElementById("ev-revenue").value;
  const customerId   = document.getElementById("proj-customer").value || null;

  if (!name) {
    document.getElementById("field-proj-name").classList.add("has-error");
    valid = false;
  }
  if (!startTimeVal) {
    document.getElementById("field-ev-start")?.classList.add("has-error");
    valid = false;
  }
  if (!endTimeVal) {
    document.getElementById("field-ev-end")?.classList.add("has-error");
    valid = false;
  }

  const startDT = startTimeVal ? new Date(startTimeVal) : null;
  const endDT   = endTimeVal   ? new Date(endTimeVal)   : null;
  if (startDT && endDT && endDT <= startDT) {
    document.getElementById("field-ev-end")?.classList.add("has-error");
    showError("End time cannot be before start time.");
  }

  // Collect shifts from shift rows
  const shifts = [];
  document.querySelectorAll(".shift-row").forEach((row) => {
    const rollId = row.querySelector("select")?.value || "";
    const qty = parseInt(row.querySelector('input[type="number"]')?.value, 10) || 1;
    const shtStartDate = row.querySelector(".shift-start-date")?.value || "";
    const shtStartTime = row.querySelector(".shift-start-time")?.value || "";
    const shtEndDate   = row.querySelector(".shift-end-date")?.value   || "";
    const shtEndTime   = row.querySelector(".shift-end-time")?.value   || "";

    if (!rollId || !shtStartDate || !shtStartTime || !shtEndDate || !shtEndTime) {
      row.querySelector(".field")?.classList.add("has-error");
      valid = false;
    }

    const shtStartDT = shtStartDate && shtStartTime ? new Date(`${shtStartDate}T${shtStartTime}`) : null;
    const shtEndDT   = shtEndDate   && shtEndTime   ? new Date(`${shtEndDate}T${shtEndTime}`)     : null;

    if (shtStartDT && shtEndDT && shtEndDT <= shtStartDT) {
      row.querySelector(".field")?.classList.add("has-error");
      showError("A shift's end time must be after its start time.");
    }

    shifts.push({
      rollId,
      requiredQuantity: qty,
      startTime: shtStartDT ? shtStartDT.toISOString() : null,
      endTime:   shtEndDT   ? shtEndDT.toISOString()   : null,
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
    name,
    startTime:      startDT ? startDT.toISOString() : null,
    endTime:        endDT   ? endDT.toISOString()   : null,
    location,
    eventType,
    attendeesCount: attendees ? parseInt(attendees, 10) : null,
    plannedBudget:  budget    ? parseFloat(budget)      : null,
    expectedRevenue: revenue  ? parseFloat(revenue)     : null,
    customerId,
    status: "planning",
    shifts,
  };
}

// ── Submit event ────────────────────────────────────────────────────────────
document
  .getElementById("btn-submit-project")
  .addEventListener("click", async () => {
    const body = collectEventFormData();
    if (!body) return;

    const btn = document.getElementById("btn-submit-project");
    btn.disabled = true;
    btn.textContent = _t("Saving…", "שומר…");

    const errBanner = document.getElementById("create-project-error");
    errBanner.classList.remove("visible");

    try {
      const token = await getToken(true);
      const res = await fetch(`${API_BASE}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        errBanner.textContent = res.status === 401
          ? "Your session expired. Please sign out and sign in again."
          : (data.error || "Failed to create event.");
        errBanner.classList.add("visible");
        return;
      }
      activateSection("events");
    } catch {
      errBanner.textContent = "Network error. Please check your connection.";
      errBanner.classList.add("visible");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="calendar-plus"></i> Create Event`;
      if (window.lucide) lucide.createIcons();
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

// ── Event delegation on gantt containers ───────────────────────────────────
function _handleGanttActionClick(e) {
  const editBtn = e.target.closest(".gantt-bar-btn-edit");
  const deleteBtn = e.target.closest(".gantt-bar-btn-delete");
  const addShiftBtn = e.target.closest(".btn-add-shift-gantt");
  if (editBtn) openShiftEditModal(editBtn);
  if (deleteBtn) openShiftDeleteModal(deleteBtn.dataset.shiftId);
  if (addShiftBtn)
    openShiftAddModal(
      addShiftBtn.dataset.eventId,
      addShiftBtn.dataset.eventDate,
      addShiftBtn.dataset.eventStartTime,
      addShiftBtn.dataset.eventEndTime,
    );
}

document.getElementById("gantt-container")?.addEventListener("click", _handleGanttActionClick);
document.getElementById("ed-gantt-container")?.addEventListener("click", _handleGanttActionClick);

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
    btn.textContent = _t("Saving…", "שומר…");

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
      if (currentEventId) _eventScheduleCache.delete(currentEventId);
      if (currentEventId) loadEventSchedule(currentEventId);
      else if (currentProjectId) loadProjectSchedule(currentProjectId);
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
      if (currentEventId) _eventScheduleCache.delete(currentEventId);
      if (currentEventId) loadEventSchedule(currentEventId);
      else if (currentProjectId) loadProjectSchedule(currentProjectId);
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

async function openShiftAddModal(eventId, eventDate, eventStartTime = "", eventEndTime = "") {
  addingShiftEventId = eventId;
  addingShiftEventDate = eventDate;

  const errEl = document.getElementById("shift-add-error");
  errEl.style.display = "none";
  errEl.textContent = "";

  document.getElementById("shift-add-start").value = eventStartTime || "";
  document.getElementById("shift-add-end").value = eventEndTime || "";
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
    btn.textContent = _t("Saving…", "שומר…");

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

      const changedEventId = addingShiftEventId;
      closeShiftAddModal();
      if (currentEventId) _eventScheduleCache.delete(currentEventId);
      else _eventScheduleCache.delete(changedEventId);
      if (currentEventId) loadEventSchedule(currentEventId);
      else if (currentProjectId) loadProjectSchedule(currentProjectId);
    } catch {
      errEl.textContent = "Network error. Please try again.";
      errEl.style.display = "";
    } finally {
      btn.disabled = false;
      btn.innerHTML = `${_ICON.plus} ${_t("Add Shift", "הוסף משמרת")}`;
    }
  });


// ── PROJECT STAFFING (Employees Tab) ──────────────────────────────────────────

function _renderShiftSummaryStrip(eventId, allWorkers) {
  const el = document.getElementById(`ps-strip-${eventId}`);
  if (!el) return;

  const shiftMap = new Map();
  for (const w of allWorkers) {
    if (!w.shiftId) continue;
    if (!shiftMap.has(w.shiftId)) {
      shiftMap.set(w.shiftId, {
        roleName:         w.roleName        ?? "",
        shiftStart:       w.shiftStart,
        shiftEnd:         w.shiftEnd,
        requiredQuantity: w.requiredQuantity ?? 0,
        activeAssignments: 0,
      });
    }
  }
  // Tally active assignments (approved workers count toward filled slots)
  for (const w of allWorkers) {
    if (!w.shiftId || w.status !== "manager_approved") continue;
    const entry = shiftMap.get(w.shiftId);
    if (entry) entry.activeAssignments++;
  }

  if (shiftMap.size === 0) { el.innerHTML = ""; return; }

  const fmt = (dt) =>
    dt
      ? new Date(dt).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "";

  const pills = [...shiftMap.values()]
    .map((s) => {
      const start = fmt(s.shiftStart);
      const end   = fmt(s.shiftEnd);
      const time  = start ? (end ? `${start}–${end}` : start) : "";
      const label = time ? `${s.roleName} · ${time}` : s.roleName;
      const filled = s.activeAssignments >= s.requiredQuantity;
      const cls   = filled ? "ps-strip-pill--full" : "ps-strip-pill--open";
      return `<span class="ps-strip-pill ${cls}" title="${escapeHtml(label)}">${escapeHtml(s.roleName)}${time ? ` <span class="ps-strip-time">${escapeHtml(time)}</span>` : ""} <strong>${s.activeAssignments}/${s.requiredQuantity}</strong></span>`;
    })
    .join("");

  el.innerHTML = pills;
}

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
    loadAndRenderPotentialWorkers(ev.eventId);
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
      <div class="ps-strip" id="ps-strip-${ev.eventId}"><span class="ps-strip-loading">Loading shifts…</span></div>
      ${_buildPotentialSection(ev.eventId)}
      ${_buildStaffingSection(ev.eventId, "awaiting",   _t("Awaiting Response", "ממתינים לתגובה"),     "clock",        "pending",  [], "awaiting")}
      ${_buildStaffingSection(ev.eventId, "applicants", _t("Shift Applicants",  "מועמדים למשמרת"),      "inbox",        "pending",  [], "applicant")}
      ${_buildStaffingSection(ev.eventId, "approved",   _t("Approved Workers",  "עובדים מאושרים"),      "check-circle", "approved", [], "approved")}
      ${_buildStaffingSection(ev.eventId, "hold",       _t("Hold / Standby",    "בהמתנה"),              "pause-circle", "hold",     [], "hold")}
      ${_buildStaffingSection(ev.eventId, "rejected",   _t("Rejected Workers",  "נדחו"),                "x-circle",     "rejected", [], "rejected")}
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
      ? `<tr><td colspan="5" class="ps-empty">${_t("No workers in this category yet.", "אין עובדים בקטגוריה זו עדיין.")}</td></tr>`
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

function _fmtShiftLabel(worker) {
  const role = worker.roleName ?? "";
  const fmt = (dt) =>
    dt
      ? new Date(dt).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "";
  const start = fmt(worker.shiftStart);
  const end   = fmt(worker.shiftEnd);
  const time  = start ? (end ? `${start}–${end}` : start) : "";
  return time ? `${role} · ${time}` : role;
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
      btns += `<button class="ps-send-btn ps-send-btn--return" data-action="return-to-pool" title="${_t("Move to Potential", "העבר לעובדים פוטנציאליים")}"><i data-lucide="users"></i> ${_t("Return to Pool", "החזר למאגר")}</button>`;
  }
  btns += `<button class="ps-action-btn ps-action-btn--msg" data-action="message" title="Direct message"><i data-lucide="message-circle"></i></button>`;
  if (worker.shiftId) {
    btns += `<button class="ps-action-btn ps-action-btn--msg" data-action="shift-chat" title="Shift chat"><i data-lucide="messages-square"></i></button>`;
  }
  const costLabel = worker.costPerHour ? `₪${Number(worker.costPerHour).toFixed(0)}/hr` : "—";
  const costDataLabel = escapeHtml(_t("Cost", "עלות"));

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
      <td><span class="ps-shift-badge">${escapeHtml(_fmtShiftLabel(worker))}</span></td>
      <td><span class="ps-role-chip">${escapeHtml(worker.roleName ?? "")}</span></td>
      <td class="ps-cost" data-cost-label="${costDataLabel}">${escapeHtml(costLabel)}</td>
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
      ? `<tr><td colspan="5" class="ps-empty">${_t("No workers in this category yet.", "אין עובדים בקטגוריה זו עדיין.")}</td></tr>`
      : workers.map((w) => _buildWorkerRow(w, sectionType)).join("");

  tbody.innerHTML = rows;
  if (badge) badge.textContent = workers.length;
  if (window.lucide) lucide.createIcons();
  _applyStaffingFilters();
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

    const allWorkers = [
      ...(data.awaiting   ?? []),
      ...(data.applicants ?? []),
      ...(data.approved   ?? []),
      ...(data.hold       ?? []),
      ...(data.rejected   ?? []),
    ];
    _eventChatWorkers.set(eventId, allWorkers);
    _renderShiftSummaryStrip(eventId, allWorkers);
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

function _uniqueWorkerUids(workers) {
  return [
    ...new Set(
      (workers ?? [])
        .filter((w) => w.status === "manager_approved")
        .map((w) => w.fbUid)
        .filter(Boolean),
    ),
  ];
}

function _formatChatShiftTitle(worker) {
  const role = worker?.roleName || "Shift";
  const fmt = (dt) =>
    dt
      ? new Date(dt).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "";
  const start = fmt(worker?.shiftStart);
  const end = fmt(worker?.shiftEnd);
  const time = start ? (end ? `${start}-${end}` : start) : "";
  return time ? `${role} · ${time}` : role;
}

async function _openCurrentEventChat() {
  if (!currentEventId) return;
  _initChatSection();
  activateSection("chats");

  const ev = _getCurrentEventData();
  const workers = _eventChatWorkers.get(currentEventId) ?? [];
  await openEventChat({
    eventId: currentEventId,
    title: ev?.name || "Event Chat",
    subtitle: "Event chat",
    participantUids: _uniqueWorkerUids(workers),
  });
}

async function _openShiftChatFromWorker(eventId, shiftId, worker) {
  if (!eventId || !shiftId) return;
  _initChatSection();
  activateSection("chats");

  const workers = (_eventChatWorkers.get(eventId) ?? []).filter(
    (w) => w.shiftId === shiftId,
  );
  const ev = _getCurrentEventData();
  await openShiftChat({
    shiftId,
    eventId,
    title: _formatChatShiftTitle(worker),
    subtitle: ev?.name || "Shift chat",
    participantUids: _uniqueWorkerUids(workers),
  });
}

function _closeShiftChatMenu() {
  const menu = document.getElementById("shift-chat-menu");
  const btn = document.getElementById("btn-shift-chat");
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute("aria-expanded", "false");
}

async function _toggleShiftChatMenu() {
  const menu = document.getElementById("shift-chat-menu");
  const btn = document.getElementById("btn-shift-chat");
  if (!menu || !btn || !currentEventId) return;

  if (!menu.hidden) {
    _closeShiftChatMenu();
    return;
  }

  btn.setAttribute("aria-expanded", "true");
  menu.hidden = false;
  menu.innerHTML = `<div class="shift-chat-menu-state">${_t("Loading shifts…", "טוען משמרות…")}</div>`;

  try {
    const shifts = await _getCurrentEventShiftsForChat();
    menu.innerHTML = _buildShiftChatMenuHTML(shifts);
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error("[Chat] Failed to build shift chat menu:", err);
    menu.innerHTML = `<div class="shift-chat-menu-state">${_t("Failed to load shifts.", "טעינת המשמרות נכשלה.")}</div>`;
  }
}

async function _getCurrentEventShiftsForChat() {
  if (!currentEventId) return [];
  if (_eventScheduleCache.has(currentEventId)) {
    return _eventScheduleCache.get(currentEventId)?.shifts ?? [];
  }

  const token = await getToken();
  const res = await fetch(
    `${API_BASE}/events/${encodeURIComponent(currentEventId)}/schedule`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error("Failed to load event schedule.");
  const schedule = await res.json();
  _eventScheduleCache.set(currentEventId, schedule);
  return schedule?.shifts ?? [];
}

function _buildShiftChatMenuHTML(shifts) {
  if (!shifts.length) {
    return `<div class="shift-chat-menu-state">${_t("No shifts defined for this event.", "לא הוגדרו משמרות לאירוע הזה.")}</div>`;
  }

  const workers = _eventChatWorkers.get(currentEventId) ?? [];
  return shifts
    .map((shift) => {
      const title = shift.roleName || _t("Shift", "משמרת");
      const time = _formatShiftTimeRange(shift.startTime, shift.endTime);
      const approvedCount = workers.filter(
        (w) => w.shiftId === shift.shiftId && w.status === "manager_approved",
      ).length;
      const required = Number(shift.requiredQuantity ?? 0);
      const count = required > 0 ? `${approvedCount}/${required}` : String(approvedCount);
      return `
        <button class="shift-chat-menu-item" type="button" data-shift-chat-id="${escapeHtml(shift.shiftId)}">
          <span class="shift-chat-menu-title">${escapeHtml(title)}</span>
          <span class="shift-chat-menu-time">${escapeHtml(time || _t("No time set", "לא הוגדר זמן"))}</span>
          <span class="shift-chat-menu-count">${escapeHtml(count)}</span>
        </button>`;
    })
    .join("");
}

function _formatShiftTimeRange(startIso, endIso) {
  const fmt = (dt) =>
    dt
      ? new Date(dt).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "";
  const start = fmt(startIso);
  const end = fmt(endIso);
  return start ? (end ? `${start}-${end}` : start) : "";
}

async function _fetchEventWorkersForChat(eventId) {
  if (_eventChatWorkers.has(eventId)) return _eventChatWorkers.get(eventId) ?? [];

  const token = await getToken();
  const res = await fetch(
    `${API_BASE}/events/${encodeURIComponent(eventId)}/workers`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const data = await res.json();
  const workers = [
    ...(data.awaiting ?? []),
    ...(data.applicants ?? []),
    ...(data.approved ?? []),
    ...(data.hold ?? []),
    ...(data.rejected ?? []),
  ];
  _eventChatWorkers.set(eventId, workers);
  return workers;
}

async function _openShiftChatFromMenu(shiftId) {
  if (!currentEventId || !shiftId) return;

  const shifts = await _getCurrentEventShiftsForChat();
  const shift = shifts.find((s) => s.shiftId === shiftId);
  if (!shift) return;

  _closeShiftChatMenu();
  _initChatSection();
  activateSection("chats");

  const workers = await _fetchEventWorkersForChat(currentEventId);
  const shiftWorkers = workers.filter((w) => w.shiftId === shiftId);
  const ev = _getCurrentEventData();
  const title = _formatShiftTimeRange(shift.startTime, shift.endTime)
    ? `${shift.roleName || _t("Shift", "משמרת")} · ${_formatShiftTimeRange(shift.startTime, shift.endTime)}`
    : (shift.roleName || _t("Shift", "משמרת"));

  await openShiftChat({
    shiftId,
    eventId: currentEventId,
    title,
    subtitle: ev?.name || _t("Shift chat", "צ'אט משמרת"),
    participantUids: _uniqueWorkerUids(shiftWorkers),
  });
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

function _formatAutoAssignTime(start, end) {
  const fmt = (dt) =>
    dt
      ? new Date(dt).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "";
  const startText = fmt(start);
  const endText = fmt(end);
  return startText ? (endText ? `${startText}-${endText}` : startText) : "";
}

function _pct(value) {
  const n = Number(value ?? 0);
  return `${Math.round(n * 100)}%`;
}

function _scoreBar(label, value, title) {
  const n = Math.max(0, Math.min(1, Number(value ?? 0)));
  return `
    <div class="aa-metric" title="${escapeHtml(title ?? "")}">
      <div class="aa-metric-top">
        <span>${escapeHtml(label)}</span>
        <strong>${_pct(n)}</strong>
      </div>
      <div class="aa-bar"><span style="width:${Math.round(n * 100)}%"></span></div>
    </div>`;
}

function _buildAutoAssignWorkerCard(decision) {
  const fullName = `${decision.firstName ?? ""} ${decision.lastName ?? ""}`.trim() || "Worker";
  const initials =
    ((decision.firstName ?? "")[0] ?? "") + ((decision.lastName ?? "")[0] ?? "");
  const status = decision.decision === "assigned" ? "assigned" : "standby";
  const statusLabel = status === "assigned" ? "Assigned" : "Standby";
  const attendanceText = `${Number(decision.attendanceMinutesLateAvg ?? 0).toFixed(1)} min avg late`;
  const costText =
    Number(decision.costPerHour ?? 0) > 0
      ? `${Number(decision.costPerHour).toFixed(2)}/hr`
      : "No cost set";

  return `
    <article class="aa-worker-card aa-worker-card--${status}">
      <div class="aa-worker-head">
        <div class="ps-avatar">${escapeHtml(initials.toUpperCase())}</div>
        <div class="aa-worker-title">
          <div class="aa-worker-name">${escapeHtml(fullName)}</div>
          <div class="aa-worker-rank">Rank #${Number(decision.rank ?? 0)} · score ${_pct(decision.totalScore)}</div>
        </div>
        <span class="aa-status aa-status--${status}">${statusLabel}</span>
      </div>
      <div class="aa-metrics-grid">
        ${_scoreBar("Commitment", decision.commitmentScore, `Accepted ${_pct(decision.commitmentRate)} of prior offers`)}
        ${_scoreBar("Attendance", decision.attendanceScore, attendanceText)}
        ${_scoreBar("Role fit", decision.roleFitScore, `${_pct(decision.roleExperienceRate)} of approved shifts were in this role`)}
        ${_scoreBar("Cost", decision.costScore, costText)}
      </div>
      <div class="aa-worker-foot">
        <span><i data-lucide="clock"></i>${escapeHtml(attendanceText)}</span>
        <span><i data-lucide="badge-dollar-sign"></i>${escapeHtml(costText)}</span>
      </div>
    </article>`;
}

function _showAutoAssignInsights(results) {
  const totalAssigned = results.reduce((s, r) => s + (r.assigned ?? 0), 0);
  const totalStandby = results.reduce((s, r) => s + (r.standby ?? 0), 0);
  const warnings = results.map((r) => r.warning).filter(Boolean);
  const shiftBlocks = results
    .map((r) => {
      const decisions = r.decisions ?? [];
      const timeText = _formatAutoAssignTime(r.shiftStart, r.shiftEnd);
      const cards = decisions.length
        ? decisions.map(_buildAutoAssignWorkerCard).join("")
        : `<div class="aa-empty">No eligible applicants were scored for this shift.</div>`;
      return `
        <section class="aa-shift-block">
          <div class="aa-shift-head">
            <div>
              <h4>${escapeHtml(r.roleName ?? "Shift")}</h4>
              <p>${escapeHtml(timeText)} · Required ${r.required ?? 0}, already approved ${r.alreadyApproved ?? 0}</p>
            </div>
            <div class="aa-shift-counts">
              <span>${r.assigned ?? 0} assigned</span>
              <span>${r.standby ?? 0} standby</span>
            </div>
          </div>
          <div class="aa-worker-grid">${cards}</div>
        </section>`;
    })
    .join("");

  document.getElementById("auto-assign-insights-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay open";
  overlay.id = "auto-assign-insights-overlay";
  overlay.innerHTML = `
    <div class="modal modal-wide auto-assign-modal" role="dialog" aria-modal="true" aria-labelledby="aa-title">
      <div class="modal-header">
        <div class="modal-header-content">
          <div class="modal-header-icon modal-icon-amber"><i data-lucide="sparkles"></i></div>
          <div class="modal-header-text">
            <h3 id="aa-title">Auto-Assign Results</h3>
          </div>
        </div>
        <button class="btn-close" data-aa-close aria-label="Close"><i data-lucide="x"></i></button>
      </div>
      <div class="modal-body auto-assign-body">
        <div class="aa-summary">
          <div><span>Assigned</span><strong>${totalAssigned}</strong></div>
          <div><span>Standby</span><strong>${totalStandby}</strong></div>
          <div><span>Scored workers</span><strong>${results.reduce((s, r) => s + ((r.decisions ?? []).length), 0)}</strong></div>
        </div>
        ${warnings.length ? `<div class="aa-warning"><i data-lucide="alert-triangle"></i><span>${escapeHtml(warnings.join(" "))}</span></div>` : ""}
        ${shiftBlocks}
      </div>
      <div class="modal-footer">
        <button class="btn-primary" data-aa-close>Done</button>
      </div>
    </div>`;

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.closest("[data-aa-close]")) close();
  });
  document.body.appendChild(overlay);
  if (window.lucide) lucide.createIcons();
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

    _showAutoAssignInsights(results);
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
    await loadAndRenderPotentialWorkers(eventId);

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
    btn.innerHTML = `<i data-lucide="users"></i> ${_t("Return to Pool", "החזר למאגר")}`;
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
          <span class="ps-section-title">${_t("Potential Workers", "עובדים פוטנציאליים")}</span>
          <span class="ps-badge ps-badge--potential" id="ps-badge-${eventId}-potential">…</span>
        </div>
        <div class="ps-section-hdr-right">
          <button class="ps-btn-primary ps-btn-send-all" data-event-id="${eventId}" disabled>
            <i data-lucide="send"></i>
            ${_t("Send Request to All", "שלח בקשה לכולם")}
          </button>
          <span class="ps-chevron">▾</span>
        </div>
      </div>
      <div class="ps-section-body" id="ps-body-${eventId}-potential">
        <div class="ps-potential-filters" id="ps-potential-filters-${eventId}" style="display:none">
          <select class="ps-filter-select" id="ps-filter-role-${eventId}">
            <option value="">${_t("All Roles", "כל התפקידים")}</option>
          </select>
          <select class="ps-filter-select" id="ps-filter-shift-${eventId}">
            <option value="">${_t("All Shifts", "כל המשמרות")}</option>
          </select>
        </div>
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
        <tr><td colspan="4" class="ps-empty">${_t("No eligible workers available for this event's shifts.", "אין עובדים מתאימים זמינים למשמרות האירוע.")}</td></tr>
      </tbody></table>`;
    return;
  }

  // Populate role/shift filter dropdowns
  const filtersEl = document.getElementById(`ps-potential-filters-${eventId}`);
  const roleSelect  = document.getElementById(`ps-filter-role-${eventId}`);
  const shiftSelect = document.getElementById(`ps-filter-shift-${eventId}`);
  if (filtersEl && roleSelect && shiftSelect) {
    const roles  = [...new Set(workers.flatMap((w) => w.eligibleShifts.map((s) => s.roleName)))].sort();
    const shifts = workers.flatMap((w) => w.eligibleShifts).reduce((acc, s) => {
      if (!acc.find((x) => x.shiftId === s.shiftId)) acc.push(s);
      return acc;
    }, []);

    roleSelect.innerHTML =
      `<option value="">All Roles</option>` +
      roles.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");
    shiftSelect.innerHTML =
      `<option value="">${_t("All Shifts", "כל המשמרות")}</option>` +
      shifts
        .map((s) => {
          const fmt = (dt) =>
            dt
              ? new Date(dt).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })
              : "";
          const start = fmt(s.startTime);
          const end   = fmt(s.endTime);
          const time  = start ? (end ? `${start}–${end}` : start) : "";
          const label = time ? `${s.roleName} · ${time}` : s.roleName;
          return `<option value="${escapeHtml(s.shiftId)}">${escapeHtml(label)}</option>`;
        })
        .join("");

    filtersEl.style.display = "";
    roleSelect.onchange  = _applyStaffingFilters;
    shiftSelect.onchange = _applyStaffingFilters;
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
        <td class="ps-cost" data-cost-label="${escapeHtml(_t("Cost", "עלות"))}">${escapeHtml(costLabel)}</td>
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
  _applyStaffingFilters();
}

async function loadAndRenderPotentialWorkers(eventId) {
  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/events/${encodeURIComponent(eventId)}/potential-workers`,
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
      if (!fbuid) return;

      const shiftIds = [
        ...row.querySelectorAll("input[data-shift-id]:checked"),
      ].map((cb) => cb.dataset.shiftId);
      if (shiftIds.length === 0) {
        alert("Select at least one shift before sending.");
        return;
      }

      await _sendOfferToWorker(
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

      const rows = [...body.querySelectorAll(".ps-row--potential")];
      const eligibleRows = rows.filter(
        (r) => r.querySelectorAll("input[data-shift-id]:checked").length > 0,
      );
      const uniqueShifts = new Set(
        eligibleRows.flatMap((r) =>
          [...r.querySelectorAll("input[data-shift-id]:checked")].map(
            (cb) => cb.dataset.shiftId,
          ),
        ),
      );
      if (eligibleRows.length === 0) { alert("No workers with selected shifts to send."); return; }
      if (
        !confirm(
          `Send shift requests to ${eligibleRows.length} worker(s) across ${uniqueShifts.size} shift(s)?`,
        )
      )
        return;

      sendAll.disabled = true;
      sendAll.innerHTML = `<i data-lucide="loader-2" class="ps-spin"></i> Sending…`;
      if (window.lucide) lucide.createIcons();
      for (const row of rows) {
        const fbuid = row.dataset.workerFbuid;
        const shiftIds = [
          ...row.querySelectorAll("input[data-shift-id]:checked"),
        ].map((cb) => cb.dataset.shiftId);
        if (!fbuid || shiftIds.length === 0) continue;
        const btn = row.querySelector(".ps-btn--send-worker");
        await _sendOfferToWorker(
          eventId,
          fbuid,
          shiftIds,
          btn,
          row,
        );
      }

      sendAll.innerHTML = `<i data-lucide="check"></i> All Sent`;
      if (window.lucide) lucide.createIcons();
      // Refresh Awaiting once after all offers are sent
      await loadAndRenderEventWorkers(eventId);
    });
  }
}

async function _sendOfferToWorker(
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
      `${API_BASE}/events/${encodeURIComponent(eventId)}/potential-workers/${encodeURIComponent(fbuid)}/send-offer`,
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
      async () => {
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
        // Refresh Awaiting to show the newly sent offer
        await loadAndRenderEventWorkers(eventId);
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

function _applyStaffingFilters() {
  const q = (document.getElementById("ps-search-input")?.value ?? "").toLowerCase();

  // Non-potential rows: filter by name and shift label
  document.querySelectorAll(".ps-root .ps-row:not(.ps-row--potential)").forEach((row) => {
    const name  = row.querySelector(".ps-worker-name")?.textContent.toLowerCase() ?? "";
    const badge = row.querySelector(".ps-shift-badge")?.textContent.toLowerCase()  ?? "";
    row.style.display = !q || name.includes(q) || badge.includes(q) ? "" : "none";
  });

  // Potential rows: filter by name + per-event role/shift dropdowns
  document.querySelectorAll(".ps-root .ps-event-block").forEach((block) => {
    const eventId = block.dataset.eventId;
    const roleFilter  = (document.getElementById(`ps-filter-role-${eventId}`)?.value  ?? "").toLowerCase();
    const shiftFilter =  document.getElementById(`ps-filter-shift-${eventId}`)?.value  ?? "";

    block.querySelectorAll(".ps-row--potential").forEach((row) => {
      const name      = row.querySelector(".ps-worker-name")?.textContent.toLowerCase() ?? "";
      const nameMatch = !q || name.includes(q);
      const roleMatch = !roleFilter || [...row.querySelectorAll(".ps-role-chip")].some(
        (c) => c.textContent.toLowerCase() === roleFilter,
      );
      const shiftMatch = !shiftFilter || !!row.querySelector(`input[data-shift-id="${CSS.escape(shiftFilter)}"]`);
      row.style.display = nameMatch && roleMatch && shiftMatch ? "" : "none";
    });
  });
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
  document.getElementById("ps-search-input")?.addEventListener("input", _applyStaffingFilters);

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
          /^ps-section-(.+)-(awaiting|applicants|approved|hold|rejected)$/,
        );
        const eventId = match?.[1];

        if (!fbUid || !eventId || !shiftId) return;

        if (action === "shift-chat") {
          const worker =
            (_eventChatWorkers.get(eventId) ?? []).find(
              (w) => w.fbUid === fbUid && w.shiftId === shiftId,
            ) ?? {
              roleName: row.querySelector(".ps-role-chip")?.textContent ?? "Shift",
            };
          await _openShiftChatFromWorker(eventId, shiftId, worker);
          return;
        }

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
const _eventScheduleCache = new Map();

// ── Back button ────────────────────────────────────────────────────────────
document
  .getElementById("btn-back-from-event-detail")
  .addEventListener("click", () => {
    activateSection("events");
  });
document
  .getElementById("btn-event-chat")
  ?.addEventListener("click", () => _openCurrentEventChat());
document
  .getElementById("btn-shift-chat")
  ?.addEventListener("click", (e) => {
    e.stopPropagation();
    _toggleShiftChatMenu();
  });
document
  .getElementById("shift-chat-menu")
  ?.addEventListener("click", async (e) => {
    const item = e.target.closest("[data-shift-chat-id]");
    if (!item) return;
    e.stopPropagation();
    await _openShiftChatFromMenu(item.dataset.shiftChatId);
  });
document.addEventListener("click", (e) => {
  const wrap = e.target.closest?.(".shift-chat-menu-wrap");
  if (!wrap) _closeShiftChatMenu();
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
  if (name === "gantt" && currentEventId) loadEventSchedule(currentEventId);
  if (name === "tasks") renderEdTasksTab();
  if (name === "briefs") renderEdBriefsTab();
  if (name === "expenses") renderEdExpensesTab();
  if (name === "payroll") renderEdPayrollTab();
  if (name === "finance") renderEdFinanceTab();
}

let _currentEventData = null; // cached EventListItemResponse for the open event

function _getCurrentEventData() {
  return _currentEventData
    ?? (currentProjectDetail?.events ?? []).find((e) => e.eventId === currentEventId)
    ?? null;
}

// ── Open event detail ──────────────────────────────────────────────────────
async function openEventDetail(eventId, evData) {
  currentEventId = eventId;
  _currentEventData = evData ?? null;
  _closeShiftChatMenu();
  _edTasksData = null;
  _edBriefsData = null;
  _edExpandedRow = null;
  _edExpensesData = null;
  _edPayrollData = null;
  _edTaskFilterPriority = "all";

  // Update header — evData comes from the kanban list, or fallback from project detail cache
  const ev = evData ?? _getCurrentEventData();
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

  const ev = _getCurrentEventData();

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
      ${_buildStaffingSection(currentEventId, "awaiting",   _t("Awaiting Response", "ממתינים לתגובה"),    "clock",        "pending",  [], "awaiting")}
      ${_buildStaffingSection(currentEventId, "applicants", _t("Shift Applicants",  "מועמדים למשמרת"),     "inbox",        "pending",  [], "applicant")}
      ${_buildStaffingSection(currentEventId, "approved",   _t("Approved Workers",  "עובדים מאושרים"),     "check-circle", "approved", [], "approved")}
      ${_buildStaffingSection(currentEventId, "hold",       _t("Hold / Standby",    "בהמתנה"),             "pause-circle", "hold",     [], "hold")}
      ${_buildStaffingSection(currentEventId, "rejected",   _t("Rejected Workers",  "נדחו"),               "x-circle",     "rejected", [], "rejected")}
    </div>`;

  if (window.lucide) lucide.createIcons();
  _initStaffingHandlers();
  _startStaffingPoll();

  loadAndRenderPotentialWorkers(currentEventId);
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
    manager_approved:   _t("Approved",   "מאושר"),
    manager_offer_sent: _t("Offer Sent", "הצעה נשלחה"),
    employee_request:   _t("Applied",    "הגיש מועמדות"),
    manager_hold:       _t("On Hold",    "בהמתנה"),
    manager_reject:     _t("Rejected",   "נדחה"),
  };
  return map[status] ?? status;
}

function _buildEdWorkersHTML(data) {
  const sections = [
    { key: "approved",   label: _t("Approved",          "עובדים מאושרים"), color: "approved" },
    { key: "awaiting",   label: _t("Awaiting Response", "ממתינים לתגובה"), color: "pending"  },
    { key: "applicants", label: _t("Applicants",        "מועמדים"),         color: "pending"  },
    { key: "hold",       label: _t("On Hold",           "בהמתנה"),          color: "hold"     },
    { key: "rejected",   label: _t("Rejected",          "נדחו"),            color: "rejected" },
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
      newSaveBtn.textContent = _t("Save", "שמור");
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
      newSaveBtn.textContent = _t("Save", "שמור");
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

function _labelExpenseType(type) {
  const labels = {
    venue: _t("venue", "מקום"),
    catering: _t("catering", "קייטרינג"),
    equipment: _t("equipment", "ציוד"),
    transport: _t("transport", "הסעות"),
    marketing: _t("marketing", "שיווק"),
    staff: _t("staff", "צוות"),
    other: _t("other", "אחר"),
  };
  return labels[type] || type;
}

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
      `<div class="pd-empty-state">${_t("No expenses recorded yet.", "לא נרשמו הוצאות עדיין.")}</div>`;
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
  div.innerHTML = `<span class="ed-expense-total-label">${_t("Total", "סה\"כ")}</span>
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
      <span class="ed-expense-type-badge">${escapeHtml(_labelExpenseType(exp.expenseType))}</span>
      <span class="ed-expense-desc">${escapeHtml(exp.description || exp.vendorName || "—")}</span>
      <span class="ed-expense-date">${_fmtDate(exp.expenseDate)}</span>
      <span class="ed-expense-amount">₪${(exp.amount ?? 0).toLocaleString("en-IL", { minimumFractionDigits: 2 })}</span>
      <button class="pd-row-delete-btn ed-expense-delete" title="${_t("Delete", "מחק")}" aria-label="${_t("Delete expense", "מחק הוצאה")}">&#10005;</button>
    </div>
    <div class="ed-expense-form" style="display:none">
      <div class="ed-expense-form-grid">
        <div class="pd-select-field">
          <label class="pd-field-label">${_t("Type", "סוג")}</label>
          <select class="pd-form-select" name="expenseType">
            ${EXPENSE_TYPES.map((t) => `<option value="${t}"${exp.expenseType === t ? " selected" : ""}>${escapeHtml(_labelExpenseType(t))}</option>`).join("")}
          </select>
        </div>
        <div class="pd-select-field">
          <label class="pd-field-label">${_t("Amount (₪)", "סכום (₪)")}</label>
          <input type="number" class="pd-form-input" name="amount" value="${exp.amount ?? ""}" min="0" step="0.01" placeholder="0.00">
        </div>
        <div class="pd-select-field">
          <label class="pd-field-label">${_t("Date", "תאריך")}</label>
          <input type="date" class="pd-form-input" name="expenseDate" value="${dateVal}">
        </div>
        <div class="pd-select-field">
          <label class="pd-field-label">${_t("Vendor", "ספק")}</label>
          <input type="text" class="pd-form-input" name="vendorName" value="${escapeHtml(exp.vendorName || "")}" placeholder="${_t("Vendor name…", "שם ספק…")}" maxlength="200">
        </div>
      </div>
      <label class="pd-field-label">${_t("Description", "תיאור")}</label>
      <input type="text" class="pd-form-input" name="description" value="${escapeHtml(exp.description || "")}" placeholder="${_t("Description…", "תיאור…")}" maxlength="500">
      <label class="pd-field-label">${_t("Notes", "הערות")}</label>
      <textarea class="pd-form-textarea" name="notes" rows="2" maxlength="1000">${escapeHtml(exp.notes || "")}</textarea>
      <div class="pd-form-actions">
        <button class="pd-form-save-btn" disabled>${_t("Save", "שמור")}</button>
        <button class="pd-form-cancel-btn">${_t("Cancel", "ביטול")}</button>
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
        _labelExpenseType(updated.expenseType);
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
      saveBtn.textContent = _t("Save", "שמור");
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
    confirm.innerHTML = `<span>${_t("Delete this expense?", "למחוק את ההוצאה הזו?")}</span>
      <button class="btn-confirm-yes">${_t("Delete", "מחק")}</button>
      <button class="btn-confirm-no">${_t("Cancel", "ביטול")}</button>`;
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
          confirm.innerHTML = `<span style="color:#ef4444">${_t("Delete failed. Try again.", "המחיקה נכשלה. נסה שוב.")}</span>
          <button class="btn-confirm-no">${_t("Dismiss", "סגור")}</button>`;
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
        `<div class="pd-empty-state">${_t("No expenses recorded yet.", "לא נרשמו הוצאות עדיין.")}</div>`;
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
      newSaveBtn.textContent = _t("Save", "שמור");
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
  const fmtTimeOnly = (iso) =>
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
    hoursLabel = _t("Approved", "מאושר");
    hoursCls = "ed-badge--approved";
  } else if (hasReported) {
    hoursLabel = _t("Submitted", "הוגש");
    hoursCls = "ed-badge--pending";
  } else {
    hoursLabel = _t("Not Reported", "לא דווח");
    hoursCls = "ed-badge--unpaid";
  }

  // Payment status badge
  let payLabel, payCls;
  if (payStatus === "paid") {
    payLabel = _t("Paid", "שולם");
    payCls = "ed-badge--paid";
  } else if (payStatus === "approved") {
    payLabel = _t("Approved", "מאושר");
    payCls = "ed-badge--approved";
  } else {
    payLabel = _t("Pending", "ממתין");
    payCls = "ed-badge--unpaid";
  }

  const reportedHtml = hasReported
    ? `<span class="ed-pr-time-summary">${fmtTimeOnly(item.actualStart)} – ${fmtTimeOnly(item.actualEnd)}${duration ? ` (${duration})` : ""}</span>`
    : `<span class="ed-pr-not-reported">${_t("Not reported", "לא דווח")}</span>`;

  const sectionAContent = hasReported
    ? `<div class="ed-pr-fields-row">
        <div class="ed-pr-field">
          <label class="ed-pr-field-label">${_t("Actual Arrival", "הגעה בפועל")}</label>
          <span class="ed-pr-field-val">${item.actualStart ? new Date(item.actualStart).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—"}</span>
        </div>
        <div class="ed-pr-field">
          <label class="ed-pr-field-label">${_t("Actual Departure", "עזיבה בפועל")}</label>
          <span class="ed-pr-field-val">${item.actualEnd ? new Date(item.actualEnd).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—"}</span>
        </div>
        ${duration ? `<div class="ed-pr-field"><label class="ed-pr-field-label">${_t("Duration", "משך")}</label><span class="ed-pr-field-val ed-pr-field-val--strong">${escapeHtml(duration)}</span></div>` : ""}
      </div>`
    : `<p class="ed-pr-empty-state">${_t("Employee has not reported hours yet.", "העובד עדיין לא דיווח שעות.")}</p>`;

  const approvedNote = hasApproved
    ? `<p class="ed-pr-approved-note">${_t("Approved", "מאושר")} ${new Date(item.approvedAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</p>`
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
          <div class="ed-badge-group"><span class="ed-badge-label">${_t("Hours", "שעות")}:</span><span class="ed-badge ${hoursCls}">${hoursLabel}</span></div>
          <div class="ed-badge-group"><span class="ed-badge-label">${_t("Pay", "שכר")}:</span><span class="ed-badge ${payCls}">${payLabel}</span></div>
        </div>
        <button class="ed-pr-review-btn">${_t("Review", "סקור")}</button>
      </div>
      <div class="ed-pr-panel" hidden>

        <!-- Step 1: Reported by Employee -->
        <div class="ed-pr-panel-section">
          <div class="ed-pr-panel-title"><span class="ed-pr-step-num">1</span> ${_t("Employee Report", "דיווח עובד")}</div>
          ${sectionAContent}
        </div>

        <!-- Step 2: Manager Approval -->
        <div class="ed-pr-panel-section">
          <div class="ed-pr-panel-title"><span class="ed-pr-step-num">2</span> ${_t("Manager Approval", "אישור מנהל")}</div>
          ${approvedNote}
          <div class="ed-pr-fields-row">
            <div class="ed-pr-field">
              <label class="ed-pr-field-label">${_t("Regular Hours", "שעות רגילות")}</label>
              <input type="number" class="ed-pr-input ed-pr-input--sm" name="approvedRegularHours"
                     value="${item.approvedRegularHours ?? ""}" min="0" step="0.5" placeholder="—">
            </div>
          </div>
          <p class="ed-pr-ot-note">${_t("Overtime is calculated automatically (first 2h ×1.25, beyond ×1.50)", "שעות נוספות מחושבות אוטומטית (שעתיים ראשונות ×1.25, מעבר לכך ×1.50)")}</p>
          <button class="ed-pr-approve-btn" data-action="approve" data-idx="${idx}">${_t("Approve Hours", "אשר שעות")}</button>
        </div>

        <!-- Step 3: Payroll -->
        <div class="ed-pr-panel-section">
          <div class="ed-pr-panel-title"><span class="ed-pr-step-num">3</span> ${_t("Payroll", "שכר")}</div>
          <div class="ed-pr-fields-row">
            <div class="ed-pr-field">
              <label class="ed-pr-field-label">${_t("Rate/hr (₪)", "תעריף לשעה (₪)")}</label>
              <input type="number" class="ed-pr-input ed-pr-input--sm" name="payRatePerHour"
                     value="${payRateVal}" min="0" step="0.01" placeholder="—">
            </div>
            <div class="ed-pr-field">
              <label class="ed-pr-field-label">${_t("Travel Refund (₪)", "החזר נסיעות (₪)")}</label>
              <input type="number" class="ed-pr-input ed-pr-input--sm" name="travelRefund"
                     value="${item.travelRefund ?? ""}" min="0" step="0.01" placeholder="—">
            </div>
            <div class="ed-pr-field">
              <label class="ed-pr-field-label">${_t("Bonus (₪)", "בונוס (₪)")}</label>
              <input type="number" class="ed-pr-input ed-pr-input--sm" name="bonusAmount"
                     value="${item.bonusAmount ?? ""}" min="0" step="0.01" placeholder="—">
            </div>
            <div class="ed-pr-field">
              <label class="ed-pr-field-label">${_t("Penalty (₪)", "קנס (₪)")}</label>
              <input type="number" class="ed-pr-input ed-pr-input--sm" name="penaltyAmount"
                     value="${item.penaltyAmount ?? ""}" min="0" step="0.01" placeholder="—">
            </div>
            <div class="ed-pr-field">
              <label class="ed-pr-field-label">${_t("Payment Status", "סטטוס תשלום")}</label>
              <select class="ed-pr-input ed-pr-select" name="paymentStatus">
                ${["pending", "approved", "paid"]
                  .map(
                    (s) =>
                      `<option value="${s}"${payStatus === s ? " selected" : ""}>${_t(s, s === "pending" ? "ממתין" : s === "approved" ? "מאושר" : "שולם")}</option>`,
                  )
                  .join("")}
              </select>
            </div>
          </div>
          <button class="ed-pr-save-btn" data-action="save" data-idx="${idx}">${_t("Save Payroll", "שמור שכר")}</button>
        </div>

      </div>
    </div>`;
}

function _edBuildPayrollHTML(items) {
  if (!items || items.length === 0) {
    return `<div class="pd-empty-state">${_t("No approved workers for payroll.", "אין עובדים מאושרים לשכר.")}</div>`;
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
        ? _t("Review", "סקור")
        : _t("Close", "סגור");
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
    actionBtn.textContent = _t("Saving…", "שומר…");

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
        newRow.querySelector(".ed-pr-review-btn").textContent = _t("Close", "סגור");
        row.replaceWith(newRow);
      }
    } catch {
      actionBtn.textContent =
        action === "approve" ? _t("Approve Hours", "אשר שעות") : _t("Save Payroll", "שמור שכר");
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
    const payroll  = await payrollRes.json();
    const expenses = await expensesRes.json();
    const invoices = await _invFetchForEvent(currentEventId);

    root.innerHTML = _edBuildFinanceHTML(payroll, expenses) +
      _invBuildFinanceBlock(invoices, { createBtnId: "ed-inv-create-btn", context: "event" });

    lucide.createIcons();

    document.getElementById("ed-inv-create-btn")?.addEventListener("click", () => {
      const ev = _getCurrentEventData();
      openInvoiceModal({
        prefillEventId:    currentEventId,
        prefillProjectId:  ev?.projectId || null,
        prefillCustomerId: ev?.customerId || null,
        prefillAmount:     ev?.expectedRevenue || "",
      });
    });
  } catch {
    root.innerHTML =
      '<div class="pd-loading">Failed to load finance data.</div>';
  }
}

function _edBuildFinanceHTML(payroll, expenses) {
  const fmt = (n) =>
    `₪${(n || 0).toLocaleString("en-IL", { minimumFractionDigits: 2 })}`;

  // Pull planned budget / expected revenue from cached event data
  const ev = _getCurrentEventData();
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
      <td>${fmt(ot)} <span class='ed-fin-ot-note' title='${_t("First 2 OT hours ×1.25, beyond ×1.50 (Israeli law)", "שעתיים ראשונות ×1.25, מעבר לכך ×1.50")}'>⚖</span></td>
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
        `<tr><td>${escapeHtml(_labelExpenseType(type))}</td><td>${fmt(amt)}</td></tr>`,
    )
    .join("");

  if (financePayroll.length === 0 && Object.keys(byType).length === 0) {
    return `<div class="pd-empty-state">${_t(
      "No finance-ready records yet. Hours must be approved and payment status set to Approved or Paid.",
      "אין עדיין נתונים מוכנים לכספים. יש לאשר שעות ולהגדיר סטטוס תשלום כמאושר או שולם.",
    )}</div>`;
  }

  const grandTotal = totalLabor + totalExpenses;

  const profitLoss = (expectedRevenue ?? 0) - grandTotal;
  const profitCls  = profitLoss >= 0 ? "ed-finance-card--profit" : "ed-finance-card--loss";

  return `
    <div class="ed-finance-cards">
      ${plannedBudget  !== null ? `<div class="ed-finance-card ed-finance-card--plan"><div class="ed-finance-card-label">${_t("Planned Budget", "תקציב מתוכנן")}</div><div class="ed-finance-card-value">${fmt(plannedBudget)}</div></div>` : ""}
      ${expectedRevenue !== null ? `<div class="ed-finance-card ed-finance-card--rev"><div class="ed-finance-card-label">${_t("Expected Revenue", "הכנסה צפויה")}</div><div class="ed-finance-card-value">${fmt(expectedRevenue)}</div></div>` : ""}
      <div class="ed-finance-card">
        <div class="ed-finance-card-label">${_t("Total Labor Cost", "עלות עבודה כוללת")}</div>
        <div class="ed-finance-card-value">${fmt(totalLabor)}</div>
      </div>
      <div class="ed-finance-card">
        <div class="ed-finance-card-label">${_t("Total Expenses", "סה\"כ הוצאות")}</div>
        <div class="ed-finance-card-value">${fmt(totalExpenses)}</div>
      </div>
      <div class="ed-finance-card ed-finance-card--total">
        <div class="ed-finance-card-label">${_t("Grand Total Cost", "עלות כוללת")}</div>
        <div class="ed-finance-card-value">${fmt(grandTotal)}</div>
      </div>
      ${expectedRevenue !== null ? `<div class="ed-finance-card ${profitCls}"><div class="ed-finance-card-label">${_t("Profit / Loss", "רווח / הפסד")}</div><div class="ed-finance-card-value">${profitLoss >= 0 ? "+" : ""}${fmt(profitLoss)}</div></div>` : ""}
    </div>

    ${
      payroll.length > 0
        ? `
    <div class="ed-finance-section">
      <h4 class="ed-finance-section-title">${_t("Labor Breakdown", "פירוט עבודה")}</h4>
      <table class="ed-worker-table">
        <thead><tr><th>${_t("Employee", "עובד")}</th><th>${_t("Role", "תפקיד")}</th><th>${_t("Regular", "רגילות")}</th><th>${_t("Overtime", "נוספות")}</th><th>${_t("Extras", "תוספות")}</th><th>${_t("Total", "סה\"כ")}</th></tr></thead>
        <tbody>${laborRows}</tbody>
        <tfoot><tr><td colspan="5"><strong>${_t("Total Labor", "סה\"כ עבודה")}</strong></td><td><strong>${fmt(totalLabor)}</strong></td></tr></tfoot>
      </table>
    </div>`
        : ""
    }

    ${
      expenses.length > 0
        ? `
    <div class="ed-finance-section">
      <h4 class="ed-finance-section-title">${_t("Expenses by Category", "הוצאות לפי קטגוריה")}</h4>
      <table class="ed-worker-table">
        <thead><tr><th>${_t("Category", "קטגוריה")}</th><th>${_t("Amount", "סכום")}</th></tr></thead>
        <tbody>${expenseRows}</tbody>
        <tfoot><tr><td><strong>${_t("Total Expenses", "סה\"כ הוצאות")}</strong></td><td><strong>${fmt(totalExpenses)}</strong></td></tr></tfoot>
      </table>
    </div>`
        : ""
    }`;
}

// ═══════════════════════════════════════════════════════════════════════════
// INVOICE MODULE — appended to manager-dashboard context
// ═══════════════════════════════════════════════════════════════════════════

// ── State ──────────────────────────────────────────────────────────────────
let _allInvoices = [];
let _editingInvoiceId = null;
let _paymentInvoiceId = null;

const _fmtMoney = (n) =>
  `₪${(n || 0).toLocaleString("en-IL", { minimumFractionDigits: 2 })}`;

const _invStatusLabel = {
  draft: "Draft", sent: "Sent", partial: "Partial",
  paid: "Paid", overdue: "Overdue", cancelled: "Cancelled",
};

function _invStatusText(status) {
  const he = {
    draft: "טיוטה",
    sent: "נשלח",
    partial: "חלקי",
    paid: "שולם",
    overdue: "באיחור",
    cancelled: "בוטל",
  };
  return _t(_invStatusLabel[status] || status, he[status] || status);
}

function _invStatusBadge(status) {
  return `<span class="inv-badge inv-badge--${status}">${_invStatusText(status)}</span>`;
}

function _suggestInvoiceNumber() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `REQ-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// ── Load & render invoices list ────────────────────────────────────────────
async function loadInvoices() {
  const tbody = document.getElementById("inv-tbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Loading…</td></tr>`;
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/invoices`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error();
    _allInvoices = await res.json();
    _renderInvoiceTable();
    _renderInvoiceSummaryCards();
  } catch {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">${_t("Failed to load payment requests.", "טעינת דרישות תשלום נכשלה.")}</td></tr>`;
  }
}

function _renderInvoiceSummaryCards() {
  const visible = _filteredInvoices();
  const total = visible.reduce((s, i) => s + (i.invoiceAmount || 0), 0);
  const paid  = visible.reduce((s, i) => s + (i.paidAmount    || 0), 0);
  const outstanding = visible
    .filter((i) => i.paymentStatus !== "cancelled" && i.paymentStatus !== "paid")
    .reduce((s, i) => s + ((i.invoiceAmount || 0) - (i.paidAmount || 0)), 0);
  const overdue = visible
    .filter((i) => i.paymentStatus === "overdue")
    .reduce((s, i) => s + ((i.invoiceAmount || 0) - (i.paidAmount || 0)), 0);

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl("inv-stat-total",       _fmtMoney(total));
  setEl("inv-stat-paid",        _fmtMoney(paid));
  setEl("inv-stat-outstanding", _fmtMoney(outstanding));
  setEl("inv-stat-overdue",     _fmtMoney(overdue));
}

function _filteredInvoices() {
  const search = (document.getElementById("inv-search")?.value || "").toLowerCase();
  const status = document.getElementById("inv-filter-status")?.value || "";
  return _allInvoices.filter((inv) => {
    if (status && inv.paymentStatus !== status) return false;
    if (search) {
      const hay = [inv.invoiceNumber, inv.customerCompanyName, inv.eventName]
        .filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

function _renderInvoiceTable() {
  const tbody = document.getElementById("inv-tbody");
  if (!tbody) return;
  const list = _filteredInvoices();
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">${_t("No payment requests found.", "לא נמצאו דרישות תשלום.")}</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((inv) => {
    const context = inv.eventName || "—";
    return `<tr>
      <td><strong>${escapeHtml(inv.invoiceNumber)}</strong></td>
      <td>${escapeHtml(inv.customerCompanyName || "—")}</td>
      <td class="inv-context">${escapeHtml(context)}</td>
      <td>${_fmtDate(inv.invoiceDate)}</td>
      <td>${_fmtDate(inv.dueDate)}</td>
      <td>${_fmtMoney(inv.invoiceAmount)}</td>
      <td>${_fmtMoney(inv.paidAmount)}</td>
      <td>${_invStatusBadge(inv.paymentStatus)}</td>
      <td class="inv-actions">
        <button class="btn-icon-sm" title="${_t("Record Payment", "רישום תשלום")}" data-inv-pay="${escapeHtml(inv.invoiceId)}"><i data-lucide="banknote"></i></button>
        <button class="btn-icon-sm" title="${_t("Edit", "ערוך")}" data-inv-edit="${escapeHtml(inv.invoiceId)}"><i data-lucide="pencil"></i></button>
        <button class="btn-icon-sm" title="${_t("Download PDF", "הורד PDF")}" data-inv-pdf="${escapeHtml(inv.invoiceId)}" data-inv-num="${escapeHtml(inv.invoiceNumber)}"><i data-lucide="file-down"></i></button>
        <button class="btn-icon-sm btn-icon-danger" title="${_t("Cancel", "ביטול")}" data-inv-cancel="${escapeHtml(inv.invoiceId)}"><i data-lucide="x-circle"></i></button>
      </td>
    </tr>`;
  }).join("");
  lucide.createIcons();
  _wireInvoiceTableActions();
}

function _wireInvoiceTableActions() {
  const tbody = document.getElementById("inv-tbody");
  if (!tbody) return;
  tbody.querySelectorAll("[data-inv-pay]").forEach((btn) =>
    btn.addEventListener("click", () => openRecordPaymentModal(btn.dataset.invPay)));
  tbody.querySelectorAll("[data-inv-edit]").forEach((btn) =>
    btn.addEventListener("click", () => openInvoiceModal({ invoiceId: btn.dataset.invEdit })));
  tbody.querySelectorAll("[data-inv-pdf]").forEach((btn) =>
    btn.addEventListener("click", () => _downloadInvoicePdf(btn.dataset.invPdf, btn.dataset.invNum)));
  tbody.querySelectorAll("[data-inv-cancel]").forEach((btn) =>
    btn.addEventListener("click", () => _cancelInvoice(btn.dataset.invCancel)));
}

async function _downloadInvoicePdf(invoiceId, invoiceNumber) {
  try {
    const token = await getToken();
    const lang = getCurrentLanguage();
    const res = await fetch(`${API_BASE}/invoices/${encodeURIComponent(invoiceId)}/pdf?lang=${encodeURIComponent(lang)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeNumber = (invoiceNumber || invoiceId).replace(/\//g, "-");
    a.download = lang === "he" ? `דרישת-תשלום-${safeNumber}.pdf` : `payment-request-${safeNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch { alert(_t("Failed to download PDF.", "הורדת ה-PDF נכשלה.")); }
}

async function _cancelInvoice(invoiceId) {
  if (!confirm(_t("Cancel this payment request? It will be marked as Cancelled.", "לבטל את דרישת התשלום? הסטטוס יעודכן למבוטל."))) return;
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/invoices/${encodeURIComponent(invoiceId)}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 204) throw new Error();
    await loadInvoices();
  } catch { alert(_t("Failed to cancel payment request.", "ביטול דרישת התשלום נכשל.")); }
}

// ── Filters wiring ─────────────────────────────────────────────────────────
document.getElementById("inv-search")?.addEventListener("input", () => {
  _renderInvoiceTable(); _renderInvoiceSummaryCards();
});
document.getElementById("inv-filter-status")?.addEventListener("change", () => {
  _renderInvoiceTable(); _renderInvoiceSummaryCards();
});
document.getElementById("btn-create-invoice")?.addEventListener("click", () => openInvoiceModal({}));

// ── Create / Edit Invoice Modal ────────────────────────────────────────────
async function openInvoiceModal(opts = {}) {
  _editingInvoiceId = opts.invoiceId || null;
  const overlay = document.getElementById("inv-modal-overlay");
  document.getElementById("inv-modal-title").textContent =
    _editingInvoiceId ? _t("Edit Payment Request", "ערוך דרישת תשלום") : _t("New Payment Request", "דרישת תשלום חדשה");
  document.getElementById("inv-modal-save-label").textContent =
    _editingInvoiceId ? _t("Update Request", "עדכן דרישה") : _t("Save Request", "שמור דרישה");
  const errEl = document.getElementById("inv-modal-error");
  if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

  await _invLoadCustomerDropdown(opts.prefillCustomerId || null);

  const today = new Date().toISOString().slice(0, 10);
  const due30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  if (_editingInvoiceId) {
    const inv = _allInvoices.find((i) => i.invoiceId === _editingInvoiceId);
    if (inv) {
      _setVal("inv-customer", inv.customerId);
      await _invLoadEventDropdownForCustomer(inv.customerId, inv.eventId);
      _setVal("inv-number",   inv.invoiceNumber);
      _setVal("inv-status",   inv.paymentStatus);
      _setVal("inv-date",     inv.invoiceDate ? inv.invoiceDate.slice(0, 10) : today);
      _setVal("inv-due-date", inv.dueDate     ? inv.dueDate.slice(0, 10)     : due30);
      _setVal("inv-amount",   inv.invoiceAmount);
      _setVal("inv-notes",    inv.notes || "");
    }
  } else {
    _setVal("inv-customer",  opts.prefillCustomerId || "");
    _setVal("inv-project",   opts.prefillProjectId  || "");
    _setVal("inv-number",    _suggestInvoiceNumber());
    _setVal("inv-status",    "draft");
    _setVal("inv-date",      today);
    _setVal("inv-due-date",  due30);
    _setVal("inv-amount",    opts.prefillAmount || "");
    _setVal("inv-notes",     "");
    if (opts.prefillCustomerId) await _invLoadEventDropdownForCustomer(opts.prefillCustomerId, opts.prefillEventId || null);
    else _setVal("inv-event", "");
  }

  overlay.style.display = "flex";
  lucide.createIcons();
}


function _setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? "";
}

async function _invLoadCustomerDropdown(selectedId) {
  const sel = document.getElementById("inv-customer");
  if (!sel) return;
  sel.innerHTML = `<option value="">${_t("— select customer —", "— בחר לקוח —")}</option>`;
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/customers`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const customers = await res.json();
    customers.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.customerId; opt.textContent = c.customerCompanyName;
      if (c.customerId === selectedId) opt.selected = true;
      sel.appendChild(opt);
    });
  } catch { /* silent */ }
  sel.onchange = async () => { await _invLoadEventDropdownForCustomer(sel.value, null); };
  if (selectedId) await _invLoadEventDropdownForCustomer(selectedId, null);
}

async function _invLoadEventDropdownForCustomer(customerId, selectedEventId) {
  const eventSel = document.getElementById("inv-event");
  const projectSel = document.getElementById("inv-project");
  if (projectSel) projectSel.innerHTML = `<option value="">— technical wrapper —</option>`;
  if (!eventSel) return;
  eventSel.innerHTML = `<option value="">${_t("— select event —", "— בחר אירוע —")}</option>`;
  if (!customerId) return;
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/events`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const events = await res.json();
    const matchingEvents = events
      .filter((ev) => !ev.customerId || ev.customerId === customerId);
    const autoSelectedEventId = selectedEventId || (matchingEvents.length === 1 ? matchingEvents[0].eventId : null);
    matchingEvents.forEach((ev) => {
        const opt = document.createElement("option");
        opt.value = ev.eventId;
        opt.textContent = ev.name;
        opt.dataset.revenue = ev.expectedRevenue || "";
        if (ev.eventId === autoSelectedEventId) opt.selected = true;
        eventSel.appendChild(opt);
      });
    const selected = matchingEvents.find((ev) => ev.eventId === autoSelectedEventId);
    const amountEl = document.getElementById("inv-amount");
    if (selected?.expectedRevenue && amountEl && !amountEl.value) {
      amountEl.value = selected.expectedRevenue;
    }
  } catch { /* silent */ }
  eventSel.onchange = () => {
    const chosen = eventSel.options[eventSel.selectedIndex];
    if (chosen?.dataset?.revenue) _setVal("inv-amount", chosen.dataset.revenue);
  };
}

async function _invLoadProjectDropdown(customerId, selectedProjectId) {
  const sel = document.getElementById("inv-project");
  if (!sel) return;
  sel.innerHTML = `<option value="">${_t("— select project —", "— בחר פרויקט —")}</option>`;
  if (!customerId) return;
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/projects`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const projects = await res.json();
    projects.filter((p) => !p.customerId || p.customerId === customerId).forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.projId; opt.textContent = p.name;
      if (p.projId === selectedProjectId) opt.selected = true;
      sel.appendChild(opt);
    });
  } catch { /* silent */ }
  sel.onchange = async () => { await _invLoadEventDropdown(sel.value, null); };
  if (selectedProjectId) await _invLoadEventDropdown(selectedProjectId, null);
}

async function _invLoadEventDropdown(projectId, selectedEventId) {
  const sel = document.getElementById("inv-event");
  if (!sel) return;
  sel.innerHTML = `<option value="">${_t("— select event (optional) —", "— בחר אירוע (אופציונלי) —")}</option>`;
  if (!projectId) return;
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(projectId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const proj = await res.json();
    (proj.events || []).forEach((e) => {
      const opt = document.createElement("option");
      opt.value = e.eventId; opt.textContent = e.name;
      opt.dataset.revenue = e.expectedRevenue || "";
      if (e.eventId === selectedEventId) opt.selected = true;
      sel.appendChild(opt);
    });
  } catch { /* silent */ }
  sel.onchange = () => {
    const chosen = sel.options[sel.selectedIndex];
    if (chosen?.dataset?.revenue) _setVal("inv-amount", chosen.dataset.revenue);
  };
}

document.getElementById("inv-modal-close")?.addEventListener("click",  _closeInvoiceModal);
document.getElementById("inv-modal-cancel")?.addEventListener("click", _closeInvoiceModal);
document.getElementById("inv-modal-overlay")?.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) _closeInvoiceModal();
});
function _closeInvoiceModal() {
  document.getElementById("inv-modal-overlay").style.display = "none";
  _editingInvoiceId = null;
}

document.getElementById("inv-modal-save")?.addEventListener("click", async () => {
  const errEl   = document.getElementById("inv-modal-error");
  const saveBtn = document.getElementById("inv-modal-save");
  const customerId = document.getElementById("inv-customer")?.value?.trim();
  const projectId  = document.getElementById("inv-project")?.value?.trim() || null;
  const eventId    = document.getElementById("inv-event")?.value?.trim()   || null;
  const number     = document.getElementById("inv-number")?.value?.trim();
  const status     = document.getElementById("inv-status")?.value;
  const date       = document.getElementById("inv-date")?.value;
  const dueDate    = document.getElementById("inv-due-date")?.value;
  const amount     = parseFloat(document.getElementById("inv-amount")?.value);
  const notes      = document.getElementById("inv-notes")?.value?.trim() || null;

  if (!customerId)               { _showInvError(errEl, _t("Please select a customer.", "יש לבחור לקוח.")); return; }
  if (!number)                   { _showInvError(errEl, _t("Invoice number is required.", "מספר הדרישה הוא שדה חובה.")); return; }
  if (!date)                     { _showInvError(errEl, _t("Invoice date is required.", "תאריך הדרישה הוא שדה חובה.")); return; }
  if (!dueDate)                  { _showInvError(errEl, _t("Due date is required.", "תאריך יעד הוא שדה חובה.")); return; }
  if (isNaN(amount) || amount <= 0) { _showInvError(errEl, _t("Amount must be greater than 0.", "הסכום חייב להיות גדול מ-0.")); return; }

  saveBtn.disabled = true;
  if (errEl) errEl.style.display = "none";
  try {
    const token = await getToken();
    if (_editingInvoiceId) {
      const res = await fetch(`${API_BASE}/invoices/${encodeURIComponent(_editingInvoiceId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ invoiceNumber: number, invoiceDate: date, dueDate, invoiceAmount: amount, paymentStatus: status, notes }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || _t("Update failed.", "עדכון הדרישה נכשל.")); }
    } else {
      const res = await fetch(`${API_BASE}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customerId, projectId, eventId, invoiceNumber: number, invoiceDate: date, dueDate, invoiceAmount: amount, paymentStatus: status, notes }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || _t("Create failed.", "יצירת הדרישה נכשלה.")); }
    }
    _closeInvoiceModal();
    await loadInvoices();
  } catch (e) {
    _showInvError(errEl, _t(e.message || "An error occurred.", e.message || "אירעה שגיאה."));
  } finally {
    saveBtn.disabled = false;
  }
});

function _showInvError(el, msg) {
  if (!el) return;
  el.textContent = msg; el.style.display = "block";
}

// ── Record Payment Modal ───────────────────────────────────────────────────
function openRecordPaymentModal(invoiceId) {
  _paymentInvoiceId = invoiceId;
  const inv   = _allInvoices.find((i) => i.invoiceId === invoiceId);
  const errEl = document.getElementById("inv-pay-error");
  const subEl = document.getElementById("inv-pay-subtitle");
  if (subEl && inv) subEl.textContent = `${inv.invoiceNumber} — ${_fmtMoney(inv.invoiceAmount)} ${_t("total", "סה\"כ")}`;
  if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }
  _setVal("inv-pay-amount", inv?.paidAmount || "");
  _setVal("inv-pay-date",   new Date().toISOString().slice(0, 10));
  _setVal("inv-pay-status", "");
  document.getElementById("inv-pay-overlay").style.display = "flex";
  lucide.createIcons();
}

document.getElementById("inv-pay-close")?.addEventListener("click",  _closePaymentModal);
document.getElementById("inv-pay-cancel")?.addEventListener("click", _closePaymentModal);
document.getElementById("inv-pay-overlay")?.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) _closePaymentModal();
});
function _closePaymentModal() {
  document.getElementById("inv-pay-overlay").style.display = "none";
  _paymentInvoiceId = null;
}

document.getElementById("inv-pay-save")?.addEventListener("click", async () => {
  const errEl   = document.getElementById("inv-pay-error");
  const saveBtn = document.getElementById("inv-pay-save");
  const paidAmount    = parseFloat(document.getElementById("inv-pay-amount")?.value);
  const paymentDate   = document.getElementById("inv-pay-date")?.value || null;
  const paymentStatus = document.getElementById("inv-pay-status")?.value || null;

  if (isNaN(paidAmount) || paidAmount < 0) { _showInvError(errEl, _t("Paid amount must be 0 or greater.", "הסכום ששולם חייב להיות 0 או יותר.")); return; }

  saveBtn.disabled = true;
  if (errEl) errEl.style.display = "none";
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/invoices/${encodeURIComponent(_paymentInvoiceId)}/payment`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ paidAmount, paymentDate, paymentStatus: paymentStatus || null }),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || _t("Payment save failed.", "שמירת התשלום נכשלה.")); }
    _closePaymentModal();
    await loadInvoices();
  } catch (e) {
    _showInvError(errEl, _t(e.message || "An error occurred.", e.message || "אירעה שגיאה."));
  } finally {
    saveBtn.disabled = false;
  }
});

// ── Finance tab integration helpers (used by event/project finance tabs) ───
async function _invFetchForEvent(eventId) {
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/events/${encodeURIComponent(eventId)}/invoices`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok ? await res.json() : [];
  } catch { return []; }
}

async function _invFetchForProject(projectId) {
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(projectId)}/invoices`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok ? await res.json() : [];
  } catch { return []; }
}

function _invBuildFinanceBlock(invoices, opts = {}) {
  const fmt = _fmtMoney;
  const total = invoices.reduce((s, i) => s + (i.invoiceAmount || 0), 0);
  const paid  = invoices.reduce((s, i) => s + (i.paidAmount    || 0), 0);
  const outstanding = total - paid;

  const rows = invoices.map((inv) =>
    `<tr>
      <td>${escapeHtml(inv.invoiceNumber)}</td>
      <td>${_invStatusBadge(inv.paymentStatus)}</td>
      <td>${_fmtDate(inv.invoiceDate)}</td>
      <td>${_fmtDate(inv.dueDate)}</td>
      <td>${fmt(inv.invoiceAmount)}</td>
      <td>${fmt(inv.paidAmount)}</td>
      <td>${fmt(inv.invoiceAmount - inv.paidAmount)}</td>
    </tr>`
  ).join("");

  return `
  <div class="ed-finance-section inv-finance-block">
    <div class="inv-finance-header">
      <h4 class="ed-finance-section-title">${_t("Payment Requests", "דרישות תשלום")}</h4>
      <button class="btn-primary btn-sm btn-with-icon" id="${opts.createBtnId || "inv-finance-create-btn"}">
        <i data-lucide="plus"></i> ${_t("New Payment Request", "דרישת תשלום חדשה")}
      </button>
    </div>
    ${invoices.length > 0 ? `
      <div class="ed-finance-cards" style="margin-bottom:12px">
        <div class="ed-finance-card"><div class="ed-finance-card-label">${_t("Requested", "נדרש")}</div><div class="ed-finance-card-value">${fmt(total)}</div></div>
        <div class="ed-finance-card ed-finance-card--profit"><div class="ed-finance-card-label">${_t("Collected", "נגבה")}</div><div class="ed-finance-card-value">${fmt(paid)}</div></div>
        <div class="ed-finance-card ${outstanding > 0 ? "ed-finance-card--loss" : ""}">
          <div class="ed-finance-card-label">${_t("Outstanding", "יתרה לתשלום")}</div><div class="ed-finance-card-value">${fmt(outstanding)}</div>
        </div>
      </div>
      <table class="ed-worker-table">
        <thead><tr><th>${_t("Request #", "מספר דרישה")}</th><th>${_t("Status", "סטטוס")}</th><th>${_t("Date", "תאריך")}</th><th>${_t("Due", "לתשלום עד")}</th><th>${_t("Amount", "סכום")}</th><th>${_t("Paid", "שולם")}</th><th>${_t("Balance", "יתרה")}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>` : `<p class="pd-empty-state" style="padding:12px 0">${opts.context === "event"
        ? _t("No payment requests yet for this event.", "אין עדיין דרישות תשלום לאירוע הזה.")
        : _t("No payment requests yet for this item.", "אין עדיין דרישות תשלום לפריט הזה.")
      }</p>`}
  </div>`;
}



// ══════════════════════════════════════════════════════════════════════════════
//  PROJECT EDIT / DELETE
// ══════════════════════════════════════════════════════════════════════════════

// ── Wire up header buttons ─────────────────────────────────────────────────

document.getElementById("btn-edit-project").addEventListener("click", openProjectEditModal);
document.getElementById("btn-delete-project").addEventListener("click", () => confirmDelete("project"));

function _setEditSaveButton(btn, label) {
  if (!btn) return;
  btn.innerHTML = `<i data-lucide="save"></i><span>${escapeHtml(label)}</span>`;
  if (window.lucide) lucide.createIcons();
}

// ── Open edit modal ────────────────────────────────────────────────────────

function openProjectEditModal() {
  const proj = currentProjectDetail;
  if (!proj) return;

  document.getElementById("proj-edit-name").value   = proj.name ?? "";
  document.getElementById("proj-edit-start").value  = proj.startDate ? proj.startDate.slice(0, 10) : "";
  document.getElementById("proj-edit-end").value    = proj.endDate   ? proj.endDate.slice(0, 10)   : "";
  document.getElementById("proj-edit-status").value = proj.status ?? "draft";

  // Populate customer select from allCustomers
  const sel = document.getElementById("proj-edit-customer");
  sel.innerHTML = '<option value="">— No customer —</option>';
  (allCustomers || []).forEach((c) => {
    const opt = document.createElement("option");
    opt.value       = c.customerId ?? c.customer_ID ?? c.id ?? "";
    opt.textContent = c.customerCompanyName ?? c.customer_company_name ?? c.name ?? opt.value;
    if (opt.value === proj.customerId) opt.selected = true;
    sel.appendChild(opt);
  });

  const err = document.getElementById("proj-edit-error");
  err.textContent  = "";
  err.style.display = "none";

  const saveBtn = document.getElementById("proj-edit-save");
  saveBtn.disabled    = false;
  _setEditSaveButton(saveBtn, "Save Changes");

  const overlay = document.getElementById("proj-edit-overlay");
  overlay.style.display = "flex";
  if (window.lucide) lucide.createIcons();
  document.getElementById("proj-edit-name").focus();
}

function _closeProjEditModal() {
  document.getElementById("proj-edit-overlay").style.display = "none";
}

document.getElementById("proj-edit-close").addEventListener("click", _closeProjEditModal);
document.getElementById("proj-edit-cancel").addEventListener("click", _closeProjEditModal);
document.getElementById("proj-edit-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) _closeProjEditModal();
});

// ── Save ───────────────────────────────────────────────────────────────────

document.getElementById("proj-edit-save").addEventListener("click", async () => {
  const name      = document.getElementById("proj-edit-name").value.trim();
  const startDate = document.getElementById("proj-edit-start").value || null;
  const endDate   = document.getElementById("proj-edit-end").value   || null;
  const status    = document.getElementById("proj-edit-status").value;
  const customerId = document.getElementById("proj-edit-customer").value || null;

  const errEl = document.getElementById("proj-edit-error");
  errEl.style.display = "none";

  if (!name) {
    errEl.textContent  = "Project name is required.";
    errEl.style.display = "block";
    return;
  }
  if (startDate && endDate && endDate < startDate) {
    errEl.textContent  = "End date cannot be before start date.";
    errEl.style.display = "block";
    return;
  }

  const saveBtn = document.getElementById("proj-edit-save");
  saveBtn.disabled    = true;
  _setEditSaveButton(saveBtn, "Saving...");

  try {
    const token = await getToken();
    const res   = await fetch(
      `${API_BASE}/projects/${encodeURIComponent(currentProjectId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, startDate, endDate, status, customerId }),
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to update project.");
    }
    _closeProjEditModal();
    await Promise.all([
      loadProjects(),
      openProjectDetail(currentProjectId),
    ]);
  } catch (err) {
    errEl.textContent  = err.message;
    errEl.style.display = "block";
  } finally {
    saveBtn.disabled    = false;
    _setEditSaveButton(saveBtn, "Save Changes");
  }
});

// ── Delete ─────────────────────────────────────────────────────────────────

async function _executeDeleteProject() {
  const btn = document.getElementById("delete-confirm-ok");
  btn.disabled    = true;
  btn.textContent = "Deleting…";
  try {
    const token = await getToken();
    const res   = await fetch(
      `${API_BASE}/projects/${encodeURIComponent(currentProjectId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to delete project.");
    }
    _closeDeleteConfirm();
    _stopStaffingPoll();
    await loadProjects();
    activateSection("projects");
  } catch (err) {
    document.getElementById("delete-confirm-message").textContent = err.message;
  } finally {
    btn.disabled    = false;
    btn.textContent = "Delete";
  }
}


// ══════════════════════════════════════════════════════════════════════════════
//  EVENT EDIT / DELETE
// ══════════════════════════════════════════════════════════════════════════════

// ── Wire up header buttons ─────────────────────────────────────────────────

document.getElementById("btn-edit-event").addEventListener("click", openEventEditModal);
document.getElementById("btn-delete-event").addEventListener("click", () => confirmDelete("event"));

// ── Open edit modal ────────────────────────────────────────────────────────

function _toDatetimeLocal(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function openEventEditModal() {
  const ev = _getCurrentEventData();
  if (!ev) return;

  document.getElementById("event-edit-name").value       = ev.name       ?? "";
  document.getElementById("event-edit-location").value   = ev.location   ?? "";
  document.getElementById("event-edit-start").value      = _toDatetimeLocal(ev.startTime);
  document.getElementById("event-edit-end").value        = _toDatetimeLocal(ev.endTime);
  document.getElementById("event-edit-status").value     = ev.status     ?? "planning";
  document.getElementById("event-edit-type").value       = ev.eventType  ?? "other";
  document.getElementById("event-edit-budget").value     = ev.plannedBudget   != null ? ev.plannedBudget   : "";
  document.getElementById("event-edit-revenue").value    = ev.expectedRevenue != null ? ev.expectedRevenue : "";
  document.getElementById("event-edit-attendees").value  = ev.attendeesCount  != null ? ev.attendeesCount  : "";

  // Populate customer dropdown — fetch fresh if cache is empty
  if (!allCustomers?.length) {
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/customers`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) allCustomers = await res.json();
    } catch { /* silently ignore */ }
  }
  const custSel = document.getElementById("event-edit-customer");
  custSel.innerHTML = `<option value="">— ${_t("None", "ללא")} —</option>` +
    (allCustomers || []).map((c) =>
      `<option value="${c.customerId}">${escapeHtml(c.customerCompanyName)}</option>`
    ).join("");
  custSel.value = ev.customerId ?? "";

  const err = document.getElementById("event-edit-error");
  err.textContent  = "";
  err.style.display = "none";

  const saveBtn = document.getElementById("event-edit-save");
  saveBtn.disabled    = false;
  _setEditSaveButton(saveBtn, "Save Changes");

  const overlay = document.getElementById("event-edit-overlay");
  overlay.style.display = "flex";
  if (window.lucide) lucide.createIcons();
  document.getElementById("event-edit-name").focus();
}

function _closeEventEditModal() {
  document.getElementById("event-edit-overlay").style.display = "none";
}

document.getElementById("event-edit-close").addEventListener("click", _closeEventEditModal);
document.getElementById("event-edit-cancel").addEventListener("click", _closeEventEditModal);
document.getElementById("event-edit-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) _closeEventEditModal();
});

// ── Save ───────────────────────────────────────────────────────────────────

document.getElementById("event-edit-save").addEventListener("click", async () => {
  const name            = document.getElementById("event-edit-name").value.trim();
  const location        = document.getElementById("event-edit-location").value.trim() || null;
  const startTime       = document.getElementById("event-edit-start").value;
  const endTime         = document.getElementById("event-edit-end").value;
  const status          = document.getElementById("event-edit-status").value;
  const eventType       = document.getElementById("event-edit-type").value || null;
  const budgetVal       = document.getElementById("event-edit-budget").value;
  const revenueVal      = document.getElementById("event-edit-revenue").value;
  const attendeesVal    = document.getElementById("event-edit-attendees").value;
  const customerId      = document.getElementById("event-edit-customer").value || "";
  const plannedBudget   = budgetVal   !== "" ? parseFloat(budgetVal)   : null;
  const expectedRevenue = revenueVal  !== "" ? parseFloat(revenueVal)  : null;
  const attendeesCount  = attendeesVal !== "" ? parseInt(attendeesVal, 10) : null;

  const errEl = document.getElementById("event-edit-error");
  errEl.style.display = "none";

  if (!name) {
    errEl.textContent  = "Event name is required.";
    errEl.style.display = "block";
    return;
  }
  if (!startTime || !endTime) {
    errEl.textContent  = "Start time and end time are required.";
    errEl.style.display = "block";
    return;
  }
  if (endTime <= startTime) {
    errEl.textContent  = "End time must be after start time.";
    errEl.style.display = "block";
    return;
  }

  const saveBtn = document.getElementById("event-edit-save");
  saveBtn.disabled    = true;
  _setEditSaveButton(saveBtn, "Saving...");

  try {
    const token = await getToken();
    const res   = await fetch(
      `${API_BASE}/events/${encodeURIComponent(currentEventId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name, location, startTime, endTime, status,
          eventType, plannedBudget, expectedRevenue, attendeesCount, customerId,
        }),
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to update event.");
    }
    const updated = await res.json();
    _currentEventData = {
      ...(_currentEventData ?? {}),
      ...updated,
      displayStatus: updated.status ?? status,
      customerId:   updated.customerId   ?? (customerId  || null),
      customerName: updated.customerName ?? null,
    };
    _closeEventEditModal();
    document.getElementById("event-detail-title").textContent = updated.name ?? name;
    document.getElementById("event-detail-subtitle").textContent = _edFormatSubtitle(_currentEventData);
    activateSection("event-detail");
  } catch (err) {
    errEl.textContent  = err.message;
    errEl.style.display = "block";
  } finally {
    saveBtn.disabled    = false;
    _setEditSaveButton(saveBtn, "Save Changes");
  }
});

// ── Delete ─────────────────────────────────────────────────────────────────

async function _executeDeleteEvent() {
  const btn = document.getElementById("delete-confirm-ok");
  btn.disabled    = true;
  btn.textContent = "Deleting…";
  try {
    const token = await getToken();
    const res   = await fetch(
      `${API_BASE}/events/${encodeURIComponent(currentEventId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to delete event.");
    }
    _closeDeleteConfirm();
    _stopStaffingPoll();
    await loadProjects();
    activateSection("events");
  } catch (err) {
    document.getElementById("delete-confirm-message").textContent = err.message;
  } finally {
    btn.disabled    = false;
    btn.textContent = "Delete";
  }
}


// ══════════════════════════════════════════════════════════════════════════════
//  SHARED DELETE CONFIRM MODAL
// ══════════════════════════════════════════════════════════════════════════════

let _deleteTarget = null; // "project" | "event"

const _deleteWarnings = {
  project: "This will permanently delete all events, shifts, staffing, tasks, briefs, expenses, and payroll records linked to this project. Payment requests will be detached (not deleted).",
  event:   "This will permanently delete all shifts, staffing, tasks, briefs, expenses, and payroll records linked to this event. Payment requests will be detached (not deleted).",
};

function confirmDelete(target) {
  _deleteTarget = target;
  const name  = target === "project"
    ? (currentProjectDetail?.name ?? "this project")
    : (_getCurrentEventData()?.name ?? "this event");

  document.getElementById("delete-confirm-title").textContent        = `Delete ${target === "project" ? "Project" : "Event"}`;
  document.getElementById("delete-confirm-message").textContent      = `Are you sure you want to delete "${name}"?`;
  document.getElementById("delete-confirm-warning-text").textContent = _deleteWarnings[target];
  document.getElementById("delete-confirm-ok").disabled              = false;
  document.getElementById("delete-confirm-ok").textContent           = "Delete";

  const overlay = document.getElementById("delete-confirm-overlay");
  overlay.style.display = "flex";
  if (window.lucide) lucide.createIcons();
}

function _closeDeleteConfirm() {
  document.getElementById("delete-confirm-overlay").style.display = "none";
  _deleteTarget = null;
}

document.getElementById("delete-confirm-close").addEventListener("click", _closeDeleteConfirm);
document.getElementById("delete-confirm-cancel").addEventListener("click", _closeDeleteConfirm);
document.getElementById("delete-confirm-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) _closeDeleteConfirm();
});

document.getElementById("delete-confirm-ok").addEventListener("click", () => {
  if (_deleteTarget === "project") _executeDeleteProject();
  else if (_deleteTarget === "event") _executeDeleteEvent();
});

