// employee-dashboard.js
// ── Employee dashboard — chat-only view ──────────────────────────────────────

import { auth }                     from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { writeUserProfile }          from "./chat-service.js";
import { initChat, destroyChat }     from "./chat-ui.js";

// ── DOM references ────────────────────────────────────────────────────────────
const navUsername    = document.getElementById("nav-username");
const infoName       = document.getElementById("info-name");
const infoRole       = document.getElementById("info-role");
const infoCompany    = document.getElementById("info-company");
const btnLogout      = document.getElementById("btn-logout");
const btnHamburger   = document.getElementById("btn-hamburger");
const btnSidebarReopen = document.getElementById("btn-sidebar-reopen");
const sidebar        = document.querySelector(".sidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const chatSection    = document.getElementById("section-chats");

const MOBILE_BREAKPOINT = 768;

// ── Sidebar toggle (same pattern as manager-dashboard.js) ─────────────────────
function setSidebarOpen(open) {
  sidebar.classList.toggle("collapsed", !open);
  btnSidebarReopen.classList.toggle("visible", !open);
  if (sidebarBackdrop) {
    sidebarBackdrop.classList.toggle("visible", open && window.innerWidth <= MOBILE_BREAKPOINT);
  }
}

if (window.innerWidth <= MOBILE_BREAKPOINT) setSidebarOpen(false);

window.addEventListener("resize", () => {
  if (window.innerWidth <= MOBILE_BREAKPOINT) {
    setSidebarOpen(false);
  } else {
    setSidebarOpen(true);
    sidebarBackdrop?.classList.remove("visible");
  }
});

btnHamburger.addEventListener("click",     () => setSidebarOpen(false));
btnSidebarReopen.addEventListener("click", () => setSidebarOpen(true));
sidebarBackdrop?.addEventListener("click", () => setSidebarOpen(false));

// ── Auth gate ─────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "/frontend/auth.html";
    return;
  }

  const profile = JSON.parse(sessionStorage.getItem("userProfile") || "null");

  if (!profile || profile.role !== "Employee") {
    alert("Access denied. Employee accounts only.");
    await signOut(auth);
    window.location.href = "/frontend/auth.html";
    return;
  }

  // Populate navbar
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  navUsername.textContent = fullName;
  infoName.textContent    = fullName;
  infoRole.textContent    = profile.role;
  infoCompany.textContent = profile.companyId || "—";

  // Write Firestore user profile (so other users can find this employee in chat)
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

  // Initialize the chat inside the section element
  initChat(chatSection, profile, user.uid);
});

// ── Logout ────────────────────────────────────────────────────────────────────
btnLogout.addEventListener("click", async () => {
  destroyChat();
  await signOut(auth);
  sessionStorage.removeItem("userProfile");
  window.location.href = "/frontend/auth.html";
});
