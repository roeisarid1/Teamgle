import { auth, storage } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  ref, uploadBytes, getDownloadURL, listAll, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { writeUserProfile }       from "./chat-service.js";
import { initChat, destroyChat }  from "./chat-ui.js";

const API_BASE = "http://localhost:5000/api";

// ── DOM ────────────────────────────────────────────────────────────────────
const navUsername    = document.getElementById("nav-username");
const infoName       = document.getElementById("info-name");
const infoRole       = document.getElementById("info-role");
const infoCompany    = document.getElementById("info-company");
const employeeTbody  = document.getElementById("employee-tbody");
const rolesGrid      = document.getElementById("roles-grid");
const modalOverlay   = document.getElementById("modal-overlay");
const btnAddEmployee = document.getElementById("btn-add-employee");
const modalClose     = document.getElementById("modal-close");
const modalCancel    = document.getElementById("modal-cancel");
const btnSave        = document.getElementById("btn-save-employee");
const formError      = document.getElementById("form-error");
const formSuccess    = document.getElementById("form-success");
const btnLogout      = document.getElementById("btn-logout");
const btnHamburger     = document.getElementById("btn-hamburger");
const btnSidebarReopen = document.getElementById("btn-sidebar-reopen");
const sidebar          = document.querySelector(".sidebar");
const sidebarBackdrop  = document.getElementById("sidebar-backdrop");

const MOBILE_BREAKPOINT = 768;

function setSidebarOpen(open) {
  sidebar.classList.toggle("collapsed", !open);
  btnSidebarReopen.classList.toggle("visible", !open);
  // Show backdrop only on mobile when sidebar is open
  if (sidebarBackdrop) {
    sidebarBackdrop.classList.toggle("visible", open && window.innerWidth <= MOBILE_BREAKPOINT);
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

btnHamburger.addEventListener("click",     () => setSidebarOpen(false));
btnSidebarReopen.addEventListener("click", () => setSidebarOpen(true));
if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener("click", () => setSidebarOpen(false));
}

// Form inputs
const empFirstname = document.getElementById("emp-firstname");
const empLastname  = document.getElementById("emp-lastname");
const empEmail     = document.getElementById("emp-email");
const empPhone     = document.getElementById("emp-phone");
const empCost      = document.getElementById("emp-cost");

// File upload DOM refs
const profileUploadZone  = document.getElementById("profile-upload-zone");
const profileFileInput   = document.getElementById("profile-file-input");
const profilePreview     = document.getElementById("profile-preview");
const profilePlaceholder = document.getElementById("profile-placeholder");
const btnRemoveProfile   = document.getElementById("btn-remove-profile");
const documentsList      = document.getElementById("documents-list");
const btnAddDoc          = document.getElementById("btn-add-doc");

// ── State ──────────────────────────────────────────────────────────────────
let currentIdToken    = null;
let currentFirebaseUid = null;
let profile           = null;
let allEmployees      = [];
let allCustomers      = [];
let chatInitialized   = false;

// Add mode
let profileFile    = null;        // File | null — new file chosen for profile
let documentFiles  = [];          // Array of { file, title } | null (nulled on remove)

// Edit mode
let editingEmployeeId   = null;   // null = add, string = edit
let existingProfilePath = null;   // Firebase storage path of current profile image
let replaceProfile      = false;  // true when user removes existing profile in edit mode
let existingDocs        = [];     // [{ storagePath, url, name }] loaded from Firebase
let docsToDelete        = new Set(); // storagePaths marked for removal in edit mode

// Delete modal
let pendingDeleteId   = null;
let pendingDeleteName = null;

// ── Auth gate ──────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/frontend/auth.html";
    return;
  }

  currentIdToken     = await user.getIdToken();
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
  infoName.textContent    = fullName;
  infoRole.textContent    = profile.role;
  infoCompany.textContent = profile.companyId || "—";

  // Write Firestore user profile so this manager appears in other users' chat user list
  try {
    await writeUserProfile(user.uid, {
      firstName: profile.firstName,
      lastName:  profile.lastName,
      email:     profile.email || "",
      companyId: profile.companyId,
      role:      profile.role
    });
  } catch (e) {
    console.warn("Chat profile write failed:", e);
  }

  await Promise.all([loadRoles(), loadEmployees()]);
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
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to load roles.");
    const roles = await res.json();
    renderRoles(roles);
  } catch {
    rolesGrid.innerHTML = '<span style="color:#ef4444;font-size:13px">Failed to load roles.</span>';
  }
}

function renderRoles(roles) {
  if (!roles.length) {
    rolesGrid.innerHTML = '<span style="color:#6b7280;font-size:13px">No roles available.</span>';
    return;
  }
  rolesGrid.innerHTML = roles.map(r => `
    <label class="role-check">
      <input type="checkbox" value="${r.rollId}" />
      ${capitalize(r.rollName)}
    </label>
  `).join("");
}

// ── Search helpers ─────────────────────────────────────────────────────────
function filterEmployees(list) {
  const q = (document.getElementById("employee-search")?.value ?? "").trim().toLowerCase();
  if (!q) return list;
  return list.filter(e => {
    const full = `${e.firstName} ${e.lastName}`.toLowerCase();
    return full.startsWith(q) || e.firstName.toLowerCase().startsWith(q) || e.lastName.toLowerCase().startsWith(q);
  });
}

function filterCustomers(list) {
  const q = (document.getElementById("customer-search")?.value ?? "").trim().toLowerCase();
  if (!q) return list;
  return list.filter(c => (c.customerCompanyName ?? "").toLowerCase().startsWith(q));
}

document.getElementById("employee-search")?.addEventListener("input", () => {
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
    const res   = await fetch(`${API_BASE}/employees`, {
      headers: { "Authorization": `Bearer ${token}` }
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

  employeeTbody.innerHTML = employees.map(e => `
    <tr>
      <td><strong>${escape(e.firstName)} ${escape(e.lastName)}</strong></td>
      <td>${escape(e.email)}</td>
      <td>${escape(e.phoneNum || "—")}</td>
      <td>${e.costPerHour != null ? `₪${Number(e.costPerHour).toFixed(2)}` : "—"}</td>
      <td>
        <div class="roles-list">
          ${e.roles.length
            ? e.roles.map(r => `<span class="role-chip">${capitalize(escape(r))}</span>`).join("")
            : '<span style="color:#6b7280;font-size:12px">—</span>'
          }
        </div>
      </td>
      <td>
        <span class="badge ${e.registrationStatus === 'Active' ? 'badge-active' : 'badge-pending'}">
          ${e.registrationStatus}
        </span>
      </td>
      <td>
        <div class="actions-cell">
          <button class="btn-action btn-action-view"
            data-action="view"
            data-id="${e.userId}"
            title="Open to view details, roles & documents">View</button>
          <button class="btn-action btn-action-edit"
            data-action="edit"
            data-id="${e.userId}">Edit</button>
          <button class="btn-action btn-action-delete"
            data-action="delete"
            data-id="${e.userId}"
            data-name="${escape(e.firstName + ' ' + e.lastName)}">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

// ── Table action delegation ────────────────────────────────────────────────
employeeTbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const id     = btn.dataset.id;

  if (action === "view") {
    await openViewModal(id);
  } else if (action === "edit") {
    await openEditModal(id);
  } else if (action === "delete") {
    openDeleteModal(id, btn.dataset.name);
  }
});

// ── View modal ─────────────────────────────────────────────────────────────
const viewModalOverlay = document.getElementById("view-modal-overlay");
document.getElementById("view-modal-close").addEventListener("click", closeViewModal);
document.getElementById("view-modal-cancel").addEventListener("click", closeViewModal);
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
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to load employee.");
    const emp = await res.json();

    // Load Firebase profile image
    let profileUrl = null;
    try {
      const profileDir   = ref(storage, `employees/${employeeId}/profile`);
      const profileItems = await listAll(profileDir);
      if (profileItems.items.length > 0) {
        profileUrl = await getDownloadURL(profileItems.items[0]);
      }
    } catch { /* no profile image */ }

    // Load Firebase documents
    let docs = [];
    try {
      const docsDir   = ref(storage, `employees/${employeeId}/documents`);
      const docsItems = await listAll(docsDir);
      for (const item of docsItems.items) {
        const url = await getDownloadURL(item);
        docs.push({ name: item.name, url });
      }
    } catch { /* no documents */ }

    const initials   = (emp.firstName[0] + emp.lastName[0]).toUpperCase();
    const statusClass = emp.registrationStatus === "Active" ? "badge-active" : "badge-pending";

    const profileHtml = profileUrl
      ? `<img class="view-profile-img" src="${profileUrl}" alt="Profile" />`
      : `<div class="view-profile-initials">${initials}</div>`;

    const rolesHtml = emp.roles && emp.roles.length
      ? emp.roles.map(r => `<span class="role-chip">${capitalize(escape(r.rollName || r))}</span>`).join("")
      : `<div class="empty-state-cta">
          <span class="empty-state-icon">🏷️</span>
          <p class="empty-state-title">No roles assigned</p>
          <p class="empty-state-hint">Assign roles to define this employee's responsibilities.</p>
          <button class="btn-empty-cta" data-edit-emp="${employeeId}">Edit Employee</button>
        </div>`;

    const docsHtml = docs.length
      ? `<div class="view-docs-list">${docs.map(d => `
          <div class="view-doc-item">
            <span class="view-doc-name" title="${escape(d.name)}">${escape(d.name)}</span>
            <a href="${d.url}" target="_blank" rel="noopener" class="btn-open-doc">Open</a>
          </div>`).join("")}
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
    body.querySelectorAll("[data-edit-emp]").forEach(btn => {
      btn.addEventListener("click", () => {
        closeViewModal();
        openEditModal(btn.dataset.editEmp);
      });
    });
  } catch {
    body.innerHTML = `<div class="empty-state" style="color:#ef4444">Failed to load employee details.</div>`;
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
  modalOverlay.classList.add("open");
}

async function openEditModal(employeeId) {
  clearForm();
  editingEmployeeId = employeeId;

  document.getElementById("modal-title").textContent = "Edit Employee";
  btnSave.textContent = "Save Changes";
  btnSave.dataset.orig = "Save Changes";
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
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to load employee.");
    const emp = await res.json();

    // Pre-fill form fields
    empFirstname.value = emp.firstName;
    empLastname.value  = emp.lastName;
    empEmail.value     = emp.email;
    empPhone.value     = emp.phoneNum || "";
    empCost.value      = emp.costPerHour != null ? emp.costPerHour : "";

    // Check the employee's current roles
    const roleIds = emp.roles.map(r => r.rollId);
    document.querySelectorAll("#roles-grid input[type='checkbox']").forEach(cb => {
      cb.checked = roleIds.includes(cb.value);
    });

    // 2. Load Firebase files
    await loadEmployeeFirebaseFiles(employeeId);

  } catch {
    showError("Failed to load employee details. Please try again.");
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = "Save Changes";
  }
}

async function loadEmployeeFirebaseFiles(employeeId) {
  // Load profile image
  try {
    const profileDir   = ref(storage, `employees/${employeeId}/profile`);
    const profileItems = await listAll(profileDir);
    if (profileItems.items.length > 0) {
      const profileRef   = profileItems.items[0];
      existingProfilePath = profileRef.fullPath;
      const url = await getDownloadURL(profileRef);
      profilePreview.src               = url;
      profilePreview.style.display     = "block";
      profilePlaceholder.style.display = "none";
      btnRemoveProfile.style.display   = "inline-block";
    }
  } catch {
    // No profile image — that's fine
  }

  // Load documents
  try {
    const docsDir   = ref(storage, `employees/${employeeId}/documents`);
    const docsItems = await listAll(docsDir);
    if (docsItems.items.length > 0) {
      documentsList.querySelector(".empty-state-cta")?.remove();
      document.getElementById("existing-docs-section").style.display = "block";
      const existingDocsList = document.getElementById("existing-docs-list");
      existingDocsList.innerHTML = "";

      for (const item of docsItems.items) {
        const url     = await getDownloadURL(item);
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
    undoBtn.type      = "button";
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
  empLastname.value  = "";
  empEmail.value     = "";
  empPhone.value     = "";
  empCost.value      = "";
  document.querySelectorAll("#roles-grid input[type='checkbox']")
    .forEach(cb => cb.checked = false);

  // Reset messages
  formError.style.display   = "none";
  formSuccess.style.display = "none";

  // Reset profile image state
  profileFile       = null;
  existingProfilePath = null;
  replaceProfile    = false;
  profileFileInput.value           = "";
  profilePreview.style.display     = "none";
  profilePreview.src               = "";
  profilePlaceholder.style.display = "flex";
  btnRemoveProfile.style.display   = "none";

  // Reset documents state
  documentFiles = [];
  documentsList.innerHTML = `
    <div class="empty-state-cta" id="docs-empty-state">
      <span class="empty-state-icon">📄</span>
      <p class="empty-state-title">No documents added</p>
      <p class="empty-state-hint">Add contracts, certificates or any relevant files for this employee.</p>
      <button type="button" class="btn-empty-cta" id="btn-add-doc-empty">+ Add First Document</button>
    </div>`;
  documentsList.querySelector("#btn-add-doc-empty").addEventListener("click", () => {
    if (editingEmployeeId) document.getElementById("new-docs-label").style.display = "block";
    addDocumentRow();
  });
  existingDocs  = [];
  docsToDelete  = new Set();
  document.getElementById("existing-docs-section").style.display = "none";
  document.getElementById("existing-docs-list").innerHTML = "";
  document.getElementById("new-docs-label").style.display = "none";

  // Reset edit mode
  editingEmployeeId = null;
  document.getElementById("modal-title").textContent = "Add New Employee";
  btnSave.textContent = "Save Employee";
  btnSave.dataset.orig = "Save Employee";
  btnSave.disabled = false;
  empEmail.disabled = false;
  empEmail.style.opacity = "";
}

// ── Save (handles both add and edit mode) ──────────────────────────────────
btnSave.addEventListener("click", async () => {
  formError.style.display   = "none";
  formSuccess.style.display = "none";

  const firstName   = empFirstname.value.trim();
  const lastName    = empLastname.value.trim();
  const email       = empEmail.value.trim().toLowerCase();
  const phoneNum    = empPhone.value.trim();
  const costPerHour = parseFloat(empCost.value);
  const roleIds     = [...document.querySelectorAll("#roles-grid input:checked")]
                        .map(cb => cb.value);

  // Client-side validation
  if (!firstName || !lastName) { showError("First and last name are required."); return; }
  if (!editingEmployeeId && (!email || !isValidEmail(email))) {
    showError("A valid email address is required."); return;
  }
  if (isNaN(costPerHour) || costPerHour < 0) {
    showError("Cost per hour must be a valid positive number."); return;
  }
  if (!roleIds.length) { showError("Please select at least one role."); return; }

  if (editingEmployeeId) {
    await handleSaveEdit(firstName, lastName, phoneNum, costPerHour, roleIds);
  } else {
    await handleSaveAdd(firstName, lastName, email, phoneNum, costPerHour, roleIds);
  }
});

// ── Add employee ───────────────────────────────────────────────────────────
async function handleSaveAdd(firstName, lastName, email, phoneNum, costPerHour, roleIds) {
  setLoading(btnSave, true);

  try {
    const token = await getToken();
    const res   = await fetch(`${API_BASE}/employees/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ firstName, lastName, email, phoneNum, costPerHour, roleIds })
    });

    const data = await res.json();
    if (!res.ok) { showError(data.error || "Failed to create employee."); return; }

    const { employeeId } = data;
    const uploadErrors   = [];

    if (profileFile) {
      btnSave.textContent = "Uploading image…";
      try { await uploadProfileImage(employeeId, profileFile); }
      catch { uploadErrors.push("Profile image upload failed."); }
    }

    const validDocs = documentFiles.filter(d => d && d.file && d.title);
    if (validDocs.length > 0) {
      btnSave.textContent = "Uploading documents…";
      try { await uploadDocuments(employeeId, validDocs); }
      catch { uploadErrors.push("Some documents failed to upload."); }
    }

    formSuccess.textContent = uploadErrors.length > 0
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
async function handleSaveEdit(firstName, lastName, phoneNum, costPerHour, roleIds) {
  setLoading(btnSave, true);

  const uploadErrors = [];

  try {
    const token = await getToken();

    // ── Firebase: handle profile image changes ─────────────────────────
    // Delete old profile if: it exists AND user removed it OR picked a new one
    if (existingProfilePath && (replaceProfile || profileFile)) {
      try { await deleteObject(ref(storage, existingProfilePath)); }
      catch { /* ignore — file may already be gone */ }
    }

    if (profileFile) {
      btnSave.textContent = "Uploading image…";
      try { await uploadProfileImage(editingEmployeeId, profileFile); }
      catch { uploadErrors.push("Profile image upload failed."); }
    }

    // ── Firebase: delete documents marked for removal ──────────────────
    for (const path of docsToDelete) {
      try { await deleteObject(ref(storage, path)); }
      catch { uploadErrors.push(`Failed to remove: ${path.split("/").pop()}`); }
    }

    // ── Firebase: upload new documents ────────────────────────────────
    const validDocs = documentFiles.filter(d => d && d.file && d.title);
    if (validDocs.length > 0) {
      btnSave.textContent = "Uploading documents…";
      try { await uploadDocuments(editingEmployeeId, validDocs); }
      catch { uploadErrors.push("Some new documents failed to upload."); }
    }

    // ── SQL: update employee ───────────────────────────────────────────
    btnSave.textContent = "Saving…";
    const res = await fetch(`${API_BASE}/employees/${editingEmployeeId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ firstName, lastName, phoneNum, costPerHour, roleIds })
    });

    const data = await res.json();
    if (!res.ok) {
      showError(data.error || "Failed to update employee.");
      return;
    }

    formSuccess.textContent = uploadErrors.length > 0
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
  pendingDeleteId   = employeeId;
  pendingDeleteName = fullName;
  document.getElementById("delete-confirm-text").textContent =
    `Are you sure you want to permanently delete "${fullName}"?`;
  document.getElementById("delete-modal-overlay").classList.add("open");
}

function closeDeleteModal() {
  document.getElementById("delete-modal-overlay").classList.remove("open");
  pendingDeleteId   = null;
  pendingDeleteName = null;
}

document.getElementById("delete-modal-close").addEventListener("click", closeDeleteModal);
document.getElementById("delete-cancel").addEventListener("click", closeDeleteModal);
document.getElementById("delete-modal-overlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("delete-modal-overlay")) closeDeleteModal();
});

document.getElementById("btn-confirm-delete").addEventListener("click", async () => {
  if (!pendingDeleteId) return;

  const btn = document.getElementById("btn-confirm-delete");
  btn.disabled    = true;
  btn.textContent = "Deleting…";

  try {
    const token = await getToken();

    // 1. Delete from SQL first — this is the authoritative source
    const res = await fetch(`${API_BASE}/employees/${pendingDeleteId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Failed to delete employee.");
      return;
    }

    // 2. Clean up Firebase Storage (best-effort — SQL is already done)
    try { await deleteEmployeeStorageFiles(pendingDeleteId); }
    catch { console.warn("Firebase Storage cleanup failed for employee:", pendingDeleteId); }

    closeDeleteModal();
    await loadEmployees();

  } catch {
    alert("Network error. Could not delete employee.");
  } finally {
    btn.disabled    = false;
    btn.textContent = "Delete Employee";
  }
});

async function deleteEmployeeStorageFiles(employeeId) {
  // Delete profile folder
  try {
    const profileItems = await listAll(ref(storage, `employees/${employeeId}/profile`));
    await Promise.all(profileItems.items.map(item => deleteObject(item)));
  } catch { /* no profile folder */ }

  // Delete documents folder
  try {
    const docsItems = await listAll(ref(storage, `employees/${employeeId}/documents`));
    await Promise.all(docsItems.items.map(item => deleteObject(item)));
  } catch { /* no documents folder */ }
}

// ── Add role inline ────────────────────────────────────────────────────────
document.getElementById("btn-add-role").addEventListener("click", () => {
  if (document.getElementById("new-role-input-row")) return;

  const row = document.createElement("div");
  row.id = "new-role-input-row";
  row.style.cssText = "display:flex;gap:6px;align-items:center;margin-top:8px;width:100%";
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

  document.getElementById("btn-cancel-role").addEventListener("click", () => row.remove());
  document.getElementById("btn-confirm-role").addEventListener("click", () => submitNewRole(input, row));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitNewRole(input, row);
    if (e.key === "Escape") row.remove();
  });
});

async function submitNewRole(input, row) {
  const roleName = input.value.trim();
  if (!roleName) { input.focus(); return; }

  const btn = document.getElementById("btn-confirm-role");
  btn.disabled    = true;
  btn.textContent = "Saving…";

  try {
    const token = await getToken();
    const res   = await fetch(`${API_BASE}/roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ roleName })
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
    document.querySelectorAll("#roles-grid input[type='checkbox']").forEach(cb => {
      if (cb.closest("label")?.textContent.trim().toLowerCase() === roleName.toLowerCase())
        cb.checked = true;
    });

  } catch {
    alert("Network error. Could not save role.");
    btn.disabled    = false;
    btn.textContent = "Add";
  }
}

// ── Profile image ──────────────────────────────────────────────────────────
profileUploadZone.addEventListener("click", () => profileFileInput.click());

profileFileInput.addEventListener("change", () => {
  const file = profileFileInput.files[0];
  if (!file) return;
  if (!validateImage(file)) { profileFileInput.value = ""; return; }
  profileFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    profilePreview.src               = e.target.result;
    profilePreview.style.display     = "block";
    profilePlaceholder.style.display = "none";
    btnRemoveProfile.style.display   = "inline-block";
  };
  reader.readAsDataURL(file);
});

btnRemoveProfile.addEventListener("click", (e) => {
  e.stopPropagation();
  replaceProfile   = true;   // mark existing profile for deletion on save
  profileFile      = null;
  profileFileInput.value           = "";
  profilePreview.style.display     = "none";
  profilePreview.src               = "";
  profilePlaceholder.style.display = "flex";
  btnRemoveProfile.style.display   = "none";
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
const DOC_TITLES = ["Form 101", "ID Copy", "Contract", "Medical Approval", "Other"];

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

  const titleOptions = DOC_TITLES.map(t =>
    `<option value="${t}">${t}</option>`
  ).join("");

  item.innerHTML = `
    <select class="doc-title-select">
      <option value="">— Select title —</option>
      ${titleOptions}
    </select>
    <div class="doc-file-area">
      <span class="doc-file-name">No file chosen</span>
      <button type="button" class="btn-pick-file">Choose File</button>
      <input type="file" accept=".pdf,.doc,.docx" hidden />
    </div>
    <button type="button" class="btn-remove-doc" title="Remove">✕</button>
  `;

  const select       = item.querySelector(".doc-title-select");
  const fileInput    = item.querySelector("input[type='file']");
  const fileNameSpan = item.querySelector(".doc-file-name");
  const pickBtn      = item.querySelector(".btn-pick-file");
  const removeBtn    = item.querySelector(".btn-remove-doc");

  select.addEventListener("change", () => {
    if (documentFiles[idx]) documentFiles[idx].title = select.value;
  });

  pickBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!validateDocument(file)) { fileInput.value = ""; return; }
    if (documentFiles[idx]) documentFiles[idx].file = file;
    fileNameSpan.textContent = file.name;
    fileNameSpan.title       = file.name;
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

// ── Firebase Storage uploads ────────────────────────────────────────────────
async function uploadProfileImage(employeeId, file) {
  const ext        = file.name.split(".").pop().toLowerCase();
  const storageRef = ref(storage, `employees/${employeeId}/profile/profile.${ext}`);
  await uploadBytes(storageRef, file);
}

async function uploadDocuments(employeeId, docs) {
  for (const doc of docs) {
    if (!doc || !doc.file || !doc.title) continue;
    const safeTitle  = doc.title.replace(/\s+/g, "-").toLowerCase();
    const safeName   = `${safeTitle}-${doc.file.name}`;
    const storageRef = ref(storage, `employees/${employeeId}/documents/${safeName}`);
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
function showError(msg) {
  formError.textContent   = msg;
  formError.style.display = "block";
}

function setLoading(btn, loading) {
  btn.disabled    = loading;
  btn.dataset.orig = btn.dataset.orig || btn.textContent;
  btn.textContent  = loading ? "Saving…" : btn.dataset.orig;
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

document.querySelectorAll(".nav-item[data-section]").forEach(item => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    activateSection(item.dataset.section);
  });
});

function activateSection(name) {
  document.querySelectorAll(".nav-item[data-section]").forEach(el => {
    el.classList.toggle("active", el.dataset.section === name);
  });
  document.querySelectorAll(".page-section").forEach(el => {
    el.style.display = el.dataset.section === name ? "" : "none";
  });

  // Toggle chat-mode class on page-content to remove padding and set fixed height
  document.querySelector(".page-content").classList.toggle("chat-mode", name === "chats");

  if (name === "customers") loadCustomers();
  if (name === "chats")     _initChatSection();
}

function _initChatSection() {
  if (chatInitialized) return;
  chatInitialized = true;
  const container = document.getElementById("section-chats");
  initChat(container, profile, currentFirebaseUid);
}

// ═══════════════════════════════════════════════════════════════════════════
// ── CUSTOMER STATE ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

let editingCustomerId         = null;
let viewingCustomerId         = null;
let editingContactId          = null;
let pendingDeleteCustomerId   = null;
let pendingDeleteContactId    = null;
let pendingDeleteContactCustId = null;

// ═══════════════════════════════════════════════════════════════════════════
// ── CUSTOMER LIST ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

async function loadCustomers() {
  const tbody = document.getElementById("customer-tbody");
  tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Loading…</td></tr>`;
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/customers`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) throw new Error();
    allCustomers = await res.json();
    renderCustomers(filterCustomers(allCustomers));
  } catch {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:#ef4444">Failed to load customers.</td></tr>`;
  }
}

function renderCustomers(customers) {
  const tbody = document.getElementById("customer-tbody");
  if (!customers.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No customers yet. Click "+ Add Customer" to get started.</td></tr>`;
    return;
  }
  tbody.innerHTML = customers.map(c => `
    <tr>
      <td><strong>${escape(c.customerCompanyName)}</strong></td>
      <td>${escape(c.companyPhone || "—")}</td>
      <td>${escape(c.companyEmail || "—")}</td>
      <td>${escape(c.companyCity  || "—")}</td>
      <td>${escape(c.businessNumber || "—")}</td>
      <td>${c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"}</td>
      <td>
        <div class="actions-cell">
          <button class="btn-action btn-action-view"
            data-cust-action="view" data-id="${c.customerId}"
            title="Open to manage contacts, files & details">View</button>
          <button class="btn-action btn-action-edit"
            data-cust-action="edit" data-id="${c.customerId}">Edit</button>
          <button class="btn-action btn-action-delete"
            data-cust-action="delete" data-id="${c.customerId}"
            data-name="${escape(c.customerCompanyName)}">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

document.getElementById("customer-tbody").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-cust-action]");
  if (!btn) return;
  const action = btn.dataset.custAction;
  const id     = btn.dataset.id;
  if (action === "view")   await openCustomerViewModal(id);
  else if (action === "edit")   await openCustomerFormModal(id);
  else if (action === "delete") openCustomerDeleteModal(id, btn.dataset.name);
});

// ═══════════════════════════════════════════════════════════════════════════
// ── CUSTOMER FORM MODAL (Add / Edit) ───────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

document.getElementById("btn-add-customer").addEventListener("click", () => openCustomerFormModal(null));
document.getElementById("customer-form-close").addEventListener("click", closeCustomerFormModal);
document.getElementById("customer-form-cancel").addEventListener("click", closeCustomerFormModal);
document.getElementById("customer-form-overlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("customer-form-overlay")) closeCustomerFormModal();
});

function clearCustomerForm() {
  ["cust-name","cust-phone","cust-email","cust-city","cust-address",
   "cust-billing-email","cust-business-number","cust-payment-terms","cust-notes"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  document.getElementById("cust-form-error").style.display   = "none";
  document.getElementById("cust-form-success").style.display = "none";
  editingCustomerId = null;
  document.getElementById("customer-form-title").textContent = "Add New Customer";
  const btn = document.getElementById("btn-save-customer");
  btn.textContent = "Save Customer";
  btn.disabled    = false;
}

async function openCustomerFormModal(customerId) {
  // Close view if open (same z-index layer)
  document.getElementById("customer-view-overlay").classList.remove("open");
  clearCustomerForm();
  document.getElementById("customer-form-overlay").classList.add("open");

  if (customerId) {
    editingCustomerId = customerId;
    document.getElementById("customer-form-title").textContent = "Edit Customer";
    const btn = document.getElementById("btn-save-customer");
    btn.textContent = "Loading…";
    btn.disabled    = true;
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/customers/${customerId}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const c = await res.json();
      document.getElementById("cust-name").value            = c.customerCompanyName || "";
      document.getElementById("cust-phone").value           = c.companyPhone || "";
      document.getElementById("cust-email").value           = c.companyEmail || "";
      document.getElementById("cust-city").value            = c.companyCity  || "";
      document.getElementById("cust-address").value         = c.companyAddress || "";
      document.getElementById("cust-billing-email").value   = c.billingEmail || "";
      document.getElementById("cust-business-number").value = c.businessNumber || "";
      document.getElementById("cust-payment-terms").value   = c.paymentTerms || "";
      document.getElementById("cust-notes").value           = c.notes || "";
    } catch {
      document.getElementById("cust-form-error").textContent = "Failed to load customer data.";
      document.getElementById("cust-form-error").style.display = "block";
    } finally {
      btn.textContent = "Save Changes";
      btn.disabled    = false;
    }
  }
}

function closeCustomerFormModal() {
  document.getElementById("customer-form-overlay").classList.remove("open");
  clearCustomerForm();
}

document.getElementById("btn-save-customer").addEventListener("click", async () => {
  const name          = document.getElementById("cust-name").value.trim();
  const phone         = document.getElementById("cust-phone").value.trim();
  const email         = document.getElementById("cust-email").value.trim();
  const city          = document.getElementById("cust-city").value.trim();
  const address       = document.getElementById("cust-address").value.trim();
  const billingEmail  = document.getElementById("cust-billing-email").value.trim();
  const businessNum   = document.getElementById("cust-business-number").value.trim();
  const paymentTerms  = document.getElementById("cust-payment-terms").value.trim();
  const notes         = document.getElementById("cust-notes").value.trim();

  const errorEl   = document.getElementById("cust-form-error");
  const successEl = document.getElementById("cust-form-success");
  errorEl.style.display   = "none";
  successEl.style.display = "none";

  if (!name) {
    errorEl.textContent = "Company name is required.";
    errorEl.style.display = "block";
    return;
  }

  const body = {
    customerCompanyName: name,
    companyPhone:    phone        || null,
    companyEmail:    email        || null,
    companyCity:     city         || null,
    companyAddress:  address      || null,
    billingEmail:    billingEmail || null,
    businessNumber:  businessNum  || null,
    paymentTerms:    paymentTerms || null,
    notes:           notes        || null
  };

  const btn = document.getElementById("btn-save-customer");
  btn.disabled    = true;
  btn.textContent = "Saving…";

  try {
    const token  = await getToken();
    const url    = editingCustomerId ? `${API_BASE}/customers/${editingCustomerId}` : `${API_BASE}/customers`;
    const method = editingCustomerId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || "Failed to save customer.";
      errorEl.style.display = "block";
      return;
    }
    successEl.textContent = editingCustomerId
      ? "Customer updated successfully."
      : `${name} added successfully.`;
    successEl.style.display = "block";
    await loadCustomers();
    setTimeout(closeCustomerFormModal, 1800);
  } catch {
    errorEl.textContent = "Network error. Please check your connection.";
    errorEl.style.display = "block";
  } finally {
    btn.disabled    = false;
    btn.textContent = editingCustomerId ? "Save Changes" : "Save Customer";
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ── CUSTOMER VIEW MODAL ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const custViewOverlay = document.getElementById("customer-view-overlay");
document.getElementById("customer-view-close").addEventListener("click", closeCustomerViewModal);
document.getElementById("customer-view-done").addEventListener("click",  closeCustomerViewModal);
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
  const body = document.getElementById("customer-view-body");
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/customers/${customerId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) throw new Error();
    const c = await res.json();

    document.getElementById("customer-view-title").textContent = c.customerCompanyName;

    // Load Firebase files
    let files = [];
    try {
      const filesDir   = ref(storage, `customers/${customerId}/files`);
      const filesItems = await listAll(filesDir);
      for (const item of filesItems.items) {
        const url = await getDownloadURL(item);
        files.push({ name: item.name, storagePath: item.fullPath, url });
      }
    } catch { /* no files folder yet */ }

    // ── contacts table ──
    const contactsHtml = c.contacts && c.contacts.length
      ? `<div class="contacts-table-wrap">
          <table class="contacts-table">
            <thead><tr>
              <th>Name</th><th>Job Title</th><th>Phone</th><th>Email</th><th>Primary</th><th>Actions</th>
            </tr></thead>
            <tbody>
              ${c.contacts.map(ct => `
                <tr>
                  <td><strong>${escape(ct.firstName)} ${escape(ct.lastName)}</strong></td>
                  <td>${escape(ct.jobTitle || "—")}</td>
                  <td>${escape(ct.phone    || "—")}</td>
                  <td>${escape(ct.email    || "—")}</td>
                  <td>${ct.isPrimary
                    ? '<span class="badge badge-active">Primary</span>'
                    : '<span style="color:#9ca3af;font-size:12px">—</span>'}</td>
                  <td>
                    <div class="actions-cell">
                      <button class="btn-action btn-action-view"
                        data-caction="view" data-cid="${ct.contactId}">View</button>
                      <button class="btn-action btn-action-edit"
                        data-caction="edit" data-cid="${ct.contactId}">Edit</button>
                      <button class="btn-action btn-action-delete"
                        data-caction="delete" data-cid="${ct.contactId}"
                        data-cname="${escape(ct.firstName + " " + ct.lastName)}">Delete</button>
                    </div>
                  </td>
                </tr>
              `).join("")}
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
          ${files.map(f => `
            <div class="doc-item-existing">
              <span class="doc-item-name" title="${escape(f.name)}">${escape(f.name)}</span>
              <a href="${f.url}" target="_blank" rel="noopener" class="btn-open-doc">Open</a>
              <button type="button" class="btn-remove-doc"
                data-fpath="${f.storagePath}" title="Delete file">✕</button>
            </div>`).join("")}
        </div>`
      : `<div class="empty-state-cta">
          <span class="empty-state-icon">📁</span>
          <p class="empty-state-title">No files uploaded</p>
          <p class="empty-state-hint">Upload contracts, quotes or any relevant documents for this customer.</p>
          <button class="btn-empty-cta" id="btn-upload-cust-empty">+ Upload First File</button>
        </div>`;

    body.innerHTML = `
      <div class="view-info-grid" style="grid-template-columns:repeat(3,1fr)">
        ${viewField("Phone",         c.companyPhone)}
        ${viewField("Email",         c.companyEmail)}
        ${viewField("City",          c.companyCity)}
        ${viewField("Address",       c.companyAddress)}
        ${viewField("Billing Email", c.billingEmail)}
        ${viewField("Business #",    c.businessNumber)}
        ${viewField("Payment Terms", c.paymentTerms)}
        ${viewField("Added",         c.createdAt ? new Date(c.createdAt).toLocaleDateString() : null)}
      </div>
      ${c.notes ? `<div class="view-info-item" style="margin-top:4px">
        <label>Notes</label>
        <span style="white-space:pre-wrap;font-size:14px;font-weight:400;color:var(--text)">${escape(c.notes)}</span>
      </div>` : ""}

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
    document.getElementById("btn-add-contact-in-view")
      .addEventListener("click", () => openContactFormModal(customerId, null));
    document.getElementById("btn-add-contact-empty")
      ?.addEventListener("click", () => openContactFormModal(customerId, null));

    // Wire — Upload File (header button + empty-state CTA)
    const triggerUpload = () => document.getElementById("cust-file-input-view").click();
    document.getElementById("btn-upload-cust-file")
      .addEventListener("click", triggerUpload);
    document.getElementById("btn-upload-cust-empty")
      ?.addEventListener("click", triggerUpload);

    document.getElementById("cust-file-input-view")
      .addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 15 * 1024 * 1024) { alert("File must be under 15 MB."); e.target.value = ""; return; }
        const uploadBtn = document.getElementById("btn-upload-cust-file");
        uploadBtn.disabled    = true;
        uploadBtn.textContent = "Uploading…";
        try {
          const safeName   = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
          const storageRef = ref(storage, `customers/${customerId}/files/${safeName}`);
          await uploadBytes(storageRef, file);
          await refreshCustomerView(customerId);
        } catch { alert("Upload failed. Please try again."); }
        finally   { e.target.value = ""; }
      });

    // Wire — Delete file buttons
    body.querySelectorAll("[data-fpath]").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this file? This cannot be undone.")) return;
        try {
          await deleteObject(ref(storage, btn.dataset.fpath));
          await refreshCustomerView(customerId);
        } catch { alert("Failed to delete file."); }
      });
    });

    // Wire — Contact action buttons
    body.querySelectorAll("[data-caction]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const caction = btn.dataset.caction;
        const cid     = btn.dataset.cid;
        if (caction === "view")   await openContactViewModal(customerId, cid);
        else if (caction === "edit")   await openContactFormModal(customerId, cid);
        else if (caction === "delete") openContactDeleteModal(cid, btn.dataset.cname, customerId);
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
document.getElementById("customer-delete-close").addEventListener("click",  closeCustomerDeleteModal);
document.getElementById("customer-delete-cancel").addEventListener("click", closeCustomerDeleteModal);
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

document.getElementById("btn-confirm-customer-delete").addEventListener("click", async () => {
  if (!pendingDeleteCustomerId) return;
  const btn = document.getElementById("btn-confirm-customer-delete");
  btn.disabled    = true;
  btn.textContent = "Deleting…";
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/customers/${pendingDeleteCustomerId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) { const d = await res.json(); alert(d.error || "Failed to delete."); return; }
    try { await deleteCustomerStorageFiles(pendingDeleteCustomerId); } catch { /* best effort */ }
    closeCustomerDeleteModal();
    await loadCustomers();
  } catch { alert("Network error. Could not delete customer."); }
  finally { btn.disabled = false; btn.textContent = "Delete Customer"; }
});

async function deleteCustomerStorageFiles(customerId) {
  try {
    const items = await listAll(ref(storage, `customers/${customerId}/files`));
    await Promise.all(items.items.map(item => deleteObject(item)));
  } catch { /* no files folder */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// ── CONTACT FORM MODAL (Add / Edit) — z-index 200 ─────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const contactFormOverlay = document.getElementById("contact-form-overlay");
document.getElementById("contact-form-close").addEventListener("click",  closeContactFormModal);
document.getElementById("contact-form-cancel").addEventListener("click", closeContactFormModal);
contactFormOverlay.addEventListener("click", (e) => {
  if (e.target === contactFormOverlay) closeContactFormModal();
});

function clearContactForm() {
  ["ct-firstname","ct-lastname","ct-phone","ct-email","ct-jobtitle","ct-notes"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  document.getElementById("ct-primary").checked = false;
  document.getElementById("ct-form-error").style.display   = "none";
  document.getElementById("ct-form-success").style.display = "none";
  editingContactId = null;
  document.getElementById("contact-form-title").textContent = "Add Contact Person";
  const btn = document.getElementById("btn-save-contact");
  btn.textContent = "Save Contact";
  btn.disabled    = false;
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
    btn.disabled    = true;
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/customers/${customerId}/contacts/${contactId}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const ct = await res.json();
      document.getElementById("ct-firstname").value  = ct.firstName  || "";
      document.getElementById("ct-lastname").value   = ct.lastName   || "";
      document.getElementById("ct-phone").value      = ct.phone      || "";
      document.getElementById("ct-email").value      = ct.email      || "";
      document.getElementById("ct-jobtitle").value   = ct.jobTitle   || "";
      document.getElementById("ct-primary").checked  = ct.isPrimary;
      document.getElementById("ct-notes").value      = ct.notes      || "";
    } catch {
      document.getElementById("ct-form-error").textContent = "Failed to load contact data.";
      document.getElementById("ct-form-error").style.display = "block";
    } finally {
      btn.textContent = "Save Changes";
      btn.disabled    = false;
    }
  }
  contactFormOverlay.classList.add("open");
}

function closeContactFormModal() {
  contactFormOverlay.classList.remove("open");
  clearContactForm();
}

document.getElementById("btn-save-contact").addEventListener("click", async () => {
  const customerId = document.getElementById("btn-save-contact").dataset.customerId;
  const firstName  = document.getElementById("ct-firstname").value.trim();
  const lastName   = document.getElementById("ct-lastname").value.trim();
  const phone      = document.getElementById("ct-phone").value.trim();
  const email      = document.getElementById("ct-email").value.trim();
  const jobTitle   = document.getElementById("ct-jobtitle").value.trim();
  const isPrimary  = document.getElementById("ct-primary").checked;
  const notes      = document.getElementById("ct-notes").value.trim();

  const errorEl   = document.getElementById("ct-form-error");
  const successEl = document.getElementById("ct-form-success");
  errorEl.style.display   = "none";
  successEl.style.display = "none";

  if (!firstName || !lastName) {
    errorEl.textContent = "First and last name are required.";
    errorEl.style.display = "block";
    return;
  }

  const body = {
    firstName, lastName,
    phone:    phone    || null,
    email:    email    || null,
    jobTitle: jobTitle || null,
    isPrimary,
    notes:    notes    || null
  };

  const btn = document.getElementById("btn-save-contact");
  btn.disabled    = true;
  btn.textContent = "Saving…";

  try {
    const token  = await getToken();
    const url    = editingContactId
      ? `${API_BASE}/customers/${customerId}/contacts/${editingContactId}`
      : `${API_BASE}/customers/${customerId}/contacts`;
    const method = editingContactId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(body)
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
    btn.disabled    = false;
    btn.textContent = editingContactId ? "Save Changes" : "Save Contact";
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ── CONTACT VIEW MODAL — z-index 200 ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const contactViewOverlay = document.getElementById("contact-view-overlay");
document.getElementById("contact-view-close").addEventListener("click", closeContactViewModal);
document.getElementById("contact-view-done").addEventListener("click",  closeContactViewModal);
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
    const res = await fetch(`${API_BASE}/customers/${customerId}/contacts/${contactId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
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
        ${viewField("Phone",     ct.phone)}
        ${viewField("Email",     ct.email)}
        ${viewField("Added",     ct.createdAt ? new Date(ct.createdAt).toLocaleDateString() : null)}
      </div>
      ${ct.notes ? `<div class="view-info-item">
        <label>Notes</label>
        <span style="white-space:pre-wrap;font-size:14px;font-weight:400">${escape(ct.notes)}</span>
      </div>` : ""}
    `;
  } catch {
    body.innerHTML = `<div class="empty-state" style="color:#ef4444">Failed to load contact details.</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ── CONTACT DELETE MODAL — z-index 200 ────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const contactDeleteOverlay = document.getElementById("contact-delete-overlay");
document.getElementById("contact-delete-close").addEventListener("click",  closeContactDeleteModal);
document.getElementById("contact-delete-cancel").addEventListener("click", closeContactDeleteModal);
contactDeleteOverlay.addEventListener("click", (e) => {
  if (e.target === contactDeleteOverlay) closeContactDeleteModal();
});

function openContactDeleteModal(contactId, name, customerId) {
  pendingDeleteContactId     = contactId;
  pendingDeleteContactCustId = customerId;
  document.getElementById("contact-delete-text").textContent =
    `Are you sure you want to delete contact "${name}"?`;
  contactDeleteOverlay.classList.add("open");
}

function closeContactDeleteModal() {
  contactDeleteOverlay.classList.remove("open");
  pendingDeleteContactId     = null;
  pendingDeleteContactCustId = null;
}

document.getElementById("btn-confirm-contact-delete").addEventListener("click", async () => {
  if (!pendingDeleteContactId) return;
  const btn = document.getElementById("btn-confirm-contact-delete");
  btn.disabled    = true;
  btn.textContent = "Deleting…";
  try {
    const token = await getToken();
    const res = await fetch(
      `${API_BASE}/customers/${pendingDeleteContactCustId}/contacts/${pendingDeleteContactId}`,
      { method: "DELETE", headers: { "Authorization": `Bearer ${token}` } }
    );
    if (!res.ok) { const d = await res.json(); alert(d.error || "Failed to delete contact."); return; }
    closeContactDeleteModal();
    if (viewingCustomerId) await refreshCustomerView(viewingCustomerId);
  } catch { alert("Network error. Could not delete contact."); }
  finally { btn.disabled = false; btn.textContent = "Delete Contact"; }
});
