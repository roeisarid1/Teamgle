import { auth, storage } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

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

// Form inputs
const empFirstname = document.getElementById("emp-firstname");
const empLastname  = document.getElementById("emp-lastname");
const empEmail     = document.getElementById("emp-email");
const empPhone     = document.getElementById("emp-phone");
const empCost      = document.getElementById("emp-cost");

// ── File upload DOM refs ───────────────────────────────────────────────────
const profileUploadZone  = document.getElementById("profile-upload-zone");
const profileFileInput   = document.getElementById("profile-file-input");
const profilePreview     = document.getElementById("profile-preview");
const profilePlaceholder = document.getElementById("profile-placeholder");
const btnRemoveProfile   = document.getElementById("btn-remove-profile");
const documentsList      = document.getElementById("documents-list");
const btnAddDoc          = document.getElementById("btn-add-doc");

// ── State ──────────────────────────────────────────────────────────────────
let currentIdToken = null;
let profile        = null;
let profileFile    = null;        // File | null
let documentFiles  = [];          // Array of { file, title } | null (nulled on remove)

// ── Auth gate ──────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/frontend/auth.html";
    return;
  }

  currentIdToken = await user.getIdToken();

  // Read profile from sessionStorage (set during login)
  profile = JSON.parse(sessionStorage.getItem("userProfile") || "null");

  if (!profile || profile.role !== "Manager") {
    alert("Access denied. Manager accounts only.");
    await signOut(auth);
    window.location.href = "/frontend/auth.html";
    return;
  }

  // Populate header info
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  navUsername.textContent  = fullName;
  infoName.textContent     = fullName;
  infoRole.textContent     = profile.role;
  infoCompany.textContent  = profile.companyId || "—";

  // Load data
  await Promise.all([loadRoles(), loadEmployees()]);
});

// ── Token helper (auto-refresh) ────────────────────────────────────────────
async function getToken() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated.");
  return await user.getIdToken(/* forceRefresh */ false);
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

// ── Load employees ─────────────────────────────────────────────────────────
async function loadEmployees() {
  employeeTbody.innerHTML = `<tr><td colspan="6" class="empty-state">Loading…</td></tr>`;
  try {
    const token = await getToken();
    const res   = await fetch(`${API_BASE}/employees`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to load employees.");
    const employees = await res.json();
    renderEmployees(employees);
  } catch {
    employeeTbody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color:#ef4444">Failed to load employees.</td></tr>`;
  }
}

function renderEmployees(employees) {
  if (!employees.length) {
    employeeTbody.innerHTML = `<tr><td colspan="6" class="empty-state">No employees yet. Click "+ Add Employee" to get started.</td></tr>`;
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
    </tr>
  `).join("");
}

// ── Modal open/close ───────────────────────────────────────────────────────
btnAddEmployee.addEventListener("click", () => openModal());
modalClose.addEventListener("click", closeModal);
modalCancel.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});

function openModal() {
  clearForm();
  modalOverlay.classList.add("open");
}

function closeModal() {
  modalOverlay.classList.remove("open");
  clearForm();
}

function clearForm() {
  empFirstname.value = "";
  empLastname.value  = "";
  empEmail.value     = "";
  empPhone.value     = "";
  empCost.value      = "";
  document.querySelectorAll("#roles-grid input[type='checkbox']")
    .forEach(cb => cb.checked = false);
  formError.style.display   = "none";
  formSuccess.style.display = "none";

  // Reset profile image
  profileFile = null;
  profileFileInput.value        = "";
  profilePreview.style.display  = "none";
  profilePreview.src            = "";
  profilePlaceholder.style.display = "flex";
  btnRemoveProfile.style.display   = "none";

  // Reset documents
  documentFiles = [];
  documentsList.innerHTML = "";
}

// ── Save employee ──────────────────────────────────────────────────────────
btnSave.addEventListener("click", async () => {
  formError.style.display   = "none";
  formSuccess.style.display = "none";

  const firstName  = empFirstname.value.trim();
  const lastName   = empLastname.value.trim();
  const email      = empEmail.value.trim().toLowerCase();
  const phoneNum   = empPhone.value.trim();
  const costPerHour = parseFloat(empCost.value);
  const roleIds    = [...document.querySelectorAll("#roles-grid input:checked")]
                       .map(cb => cb.value);

  // Client-side validation
  if (!firstName || !lastName) { showError("First and last name are required."); return; }
  if (!email || !isValidEmail(email)) { showError("A valid email address is required."); return; }
  if (isNaN(costPerHour) || costPerHour < 0) { showError("Cost per hour must be a valid positive number."); return; }
  if (!roleIds.length) { showError("Please select at least one role."); return; }

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

    if (!res.ok) {
      showError(data.error || "Failed to create employee.");
      return;
    }

    const { employeeId } = data;

    // Upload files tied to the created employee
    const uploadErrors = [];

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

    if (uploadErrors.length > 0) {
      formSuccess.textContent  = `${firstName} ${lastName} added. Note: ${uploadErrors.join(" ")}`;
    } else {
      formSuccess.textContent  = `${firstName} ${lastName} was added successfully.`;
    }
    formSuccess.style.display = "block";

    await loadEmployees();
    setTimeout(closeModal, 1800);

  } catch {
    showError("Network error. Please check your connection.");
  } finally {
    setLoading(btnSave, false);
  }
});

// ── Add role inline ────────────────────────────────────────────────────────
document.getElementById("btn-add-role").addEventListener("click", () => {
  // Prevent opening a second input if one already exists
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
  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ roleName })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Failed to create role."); btn.disabled = false; btn.textContent = "Add"; return; }

    // Add the new checkbox directly to the grid
    const label = document.createElement("label");
    label.className = "role-check";
    label.innerHTML = `<input type="checkbox" value="__pending__" checked /> ${capitalize(roleName)}`;
    rolesGrid.appendChild(label);

    row.remove();

    // Reload roles to get the real ID
    await loadRoles();
    // Re-check the newly added role by name
    document.querySelectorAll("#roles-grid input[type='checkbox']").forEach(cb => {
      if (cb.closest("label")?.textContent.trim().toLowerCase() === roleName.toLowerCase()) cb.checked = true;
    });

  } catch {
    alert("Network error. Could not save role.");
    btn.disabled = false;
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
    profilePreview.src            = e.target.result;
    profilePreview.style.display  = "block";
    profilePlaceholder.style.display = "none";
    btnRemoveProfile.style.display   = "inline-block";
  };
  reader.readAsDataURL(file);
});

btnRemoveProfile.addEventListener("click", (e) => {
  e.stopPropagation();
  profileFile = null;
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

btnAddDoc.addEventListener("click", () => addDocumentRow());

function addDocumentRow() {
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
    const safeTitle = doc.title.replace(/\s+/g, "-").toLowerCase();
    const safeName  = `${safeTitle}-${doc.file.name}`;
    const storageRef = ref(storage, `employees/${employeeId}/documents/${safeName}`);
    await uploadBytes(storageRef, doc.file);
  }
}

// ── Logout ─────────────────────────────────────────────────────────────────
btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  sessionStorage.removeItem("userProfile");
  window.location.href = "/frontend/auth.html";
});

// ── Utilities ──────────────────────────────────────────────────────────────
function showError(msg) {
  formError.textContent  = msg;
  formError.style.display = "block";
}

function setLoading(btn, loading) {
  btn.disabled = loading;
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
