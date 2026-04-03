// employee-dashboard.js
// ── Employee dashboard — job offers + chat ───────────────────────────────────

import { auth }                        from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { writeUserProfile }            from "./chat-service.js";
import { initChat, destroyChat }       from "./chat-ui.js";

const API_BASE = "http://localhost:5000/api";

// ── DOM references ────────────────────────────────────────────────────────────
const navUsername      = document.getElementById("nav-username");
const infoName         = document.getElementById("info-name");
const infoRole         = document.getElementById("info-role");
const infoCompany      = document.getElementById("info-company");
const btnLogout        = document.getElementById("btn-logout");
const btnHamburger     = document.getElementById("btn-hamburger");
const btnSidebarReopen = document.getElementById("btn-sidebar-reopen");
const sidebar          = document.querySelector(".sidebar");
const sidebarBackdrop  = document.getElementById("sidebar-backdrop");
const pageContent      = document.getElementById("page-content");
const chatSection      = document.getElementById("section-chats");
const offersList       = document.getElementById("offers-list");
const offersBadge      = document.getElementById("offers-badge");

const MOBILE_BREAKPOINT = 768;

// ── Sidebar toggle ────────────────────────────────────────────────────────────
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

// ── Section switching ─────────────────────────────────────────────────────────
let activeSection = "chats";

function showSection(sectionId) {
  document.querySelectorAll(".page-section").forEach(el => {
    el.style.display = el.dataset.section === sectionId ? "" : "none";
  });
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.section === sectionId);
  });

  // chat-mode class makes page-content zero-padding + fixed height for the chat
  if (sectionId === "chats") {
    pageContent.classList.add("chat-mode");
  } else {
    pageContent.classList.remove("chat-mode");
  }

  activeSection = sectionId;
  lucide.createIcons();
}

document.querySelectorAll(".nav-item[data-section]").forEach(link => {
  link.addEventListener("click", e => {
    e.preventDefault();
    showSection(link.dataset.section);
    if (window.innerWidth <= MOBILE_BREAKPOINT) setSidebarOpen(false);
  });
});

// ── Token helper ──────────────────────────────────────────────────────────────
async function getToken() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated.");
  return await user.getIdToken(false);
}

// ── Job Offers ────────────────────────────────────────────────────────────────
async function loadOffers() {
  offersList.innerHTML = renderSkeletons(2);

  let offers;
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/shifts/my-offers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to load offers.");
    offers = await res.json();
  } catch {
    offersList.innerHTML = `
      <div class="offers-empty">
        <i data-lucide="wifi-off" style="width:40px;height:40px;color:var(--text-muted)"></i>
        <p>Could not load offers. Please try again.</p>
      </div>`;
    lucide.createIcons();
    return;
  }

  updateBadge(offers.length);

  if (offers.length === 0) {
    offersList.innerHTML = `
      <div class="offers-empty">
        <i data-lucide="inbox" style="width:48px;height:48px;color:var(--blue-light)"></i>
        <p>No job offers right now.<br><span>Check back later.</span></p>
      </div>`;
    lucide.createIcons();
    return;
  }

  offersList.innerHTML = offers.map(renderOfferCard).join("");
  lucide.createIcons();

  // Attach respond handlers
  offersList.querySelectorAll(".offer-card").forEach(card => {
    const shiftId    = card.dataset.shiftId;
    const btnAccept  = card.querySelector(".offer-btn--accept");
    const btnDecline = card.querySelector(".offer-btn--decline");

    async function respond(accept) {
      btnAccept.disabled  = true;
      btnDecline.disabled = true;
      btnAccept.textContent  = accept ? "Saving…" : btnAccept.textContent;
      btnDecline.textContent = !accept ? "Saving…" : btnDecline.textContent;

      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/shifts/${encodeURIComponent(shiftId)}/respond`, {
          method:  "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body:    JSON.stringify({ accept }),
        });
        if (!res.ok) throw new Error();

        card.classList.add("offer-card--fade-out");
        card.addEventListener("animationend", () => {
          card.remove();
          const remaining = offersList.querySelectorAll(".offer-card").length;
          updateBadge(remaining);
          if (remaining === 0) {
            offersList.innerHTML = `
              <div class="offers-empty">
                <i data-lucide="check-circle-2" style="width:48px;height:48px;color:var(--green)"></i>
                <p>You're all caught up!</p>
              </div>`;
            lucide.createIcons();
          }
        }, { once: true });
      } catch {
        btnAccept.disabled  = false;
        btnDecline.disabled = false;
        btnAccept.textContent  = "I'm In ✓";
        btnDecline.textContent = "Can't Make It ✗";
        alert("Failed to respond. Please try again.");
      }
    }

    btnAccept.addEventListener("click",  () => respond(true));
    btnDecline.addEventListener("click", () => respond(false));
  });
}

function updateBadge(count) {
  if (count > 0) {
    offersBadge.textContent = count;
    offersBadge.style.display = "";
  } else {
    offersBadge.style.display = "none";
  }
}

// ── Event type colors ─────────────────────────────────────────────────────────
const EVENT_TYPE_COLORS = {
  wedding:    { bg: "#fdf2f8", color: "#9d174d", border: "#f9a8d4" },
  corporate:  { bg: "#eff6ff", color: "#1d4ed8", border: "#93c5fd" },
  party:      { bg: "#f5f3ff", color: "#6d28d9", border: "#c4b5fd" },
  conference: { bg: "#ecfdf5", color: "#065f46", border: "#6ee7b7" },
  concert:    { bg: "#fff7ed", color: "#9a3412", border: "#fdba74" },
  sport:      { bg: "#f0fdf4", color: "#166534", border: "#86efac" },
  birthday:   { bg: "#fefce8", color: "#854d0e", border: "#fde047" },
  other:      { bg: "#f8fafc", color: "#475569", border: "#cbd5e1" },
};

function eventTypeStyle(type) {
  const key = (type || "other").toLowerCase();
  return EVENT_TYPE_COLORS[key] || EVENT_TYPE_COLORS.other;
}

// ── Render helpers ────────────────────────────────────────────────────────────
function renderOfferCard(offer) {
  const startDt = offer.plannedStartTime || offer.shiftStartTime;
  const endDt   = offer.plannedEndTime   || offer.shiftEndTime;
  const typeStyle = eventTypeStyle(offer.eventType);

  const dateLine  = startDt ? formatDateRange(startDt, endDt) : "";
  const payLine   = (offer.payRatePerHour && offer.payRatePerHour > 0)
    ? `<div class="offer-pay">₪${Number(offer.payRatePerHour).toFixed(2)}<span>/hr</span></div>`
    : "";
  const attendees = (offer.attendeesCount && offer.attendeesCount > 0)
    ? `<div class="offer-meta-item"><i data-lucide="users" class="offer-icon"></i><span>${offer.attendeesCount} attendees</span></div>`
    : "";
  const notes = offer.notes
    ? `<blockquote class="offer-notes">${escHtml(offer.notes)}</blockquote>`
    : "";
  const location = offer.eventLocation
    ? `<div class="offer-meta-item"><i data-lucide="map-pin" class="offer-icon"></i><span>${escHtml(offer.eventLocation)}</span></div>`
    : "";

  return `
    <div class="offer-card" data-shift-id="${escHtml(offer.shiftId)}">
      <div class="offer-card-header">
        <div class="offer-project-name">${escHtml(offer.projectName)}</div>
        ${offer.eventType
          ? `<span class="offer-event-type-badge"
               style="background:${typeStyle.bg};color:${typeStyle.color};border-color:${typeStyle.border}">
               ${capitalize(offer.eventType)}
             </span>`
          : ""}
      </div>

      <h3 class="offer-event-name">${escHtml(offer.eventName)}</h3>

      ${dateLine ? `<div class="offer-meta-item offer-date"><i data-lucide="calendar" class="offer-icon"></i><span>${dateLine}</span></div>` : ""}

      <div class="offer-meta-row">
        ${location}
        <div class="offer-meta-item">
          <i data-lucide="tag" class="offer-icon"></i>
          <span class="offer-role-chip">${escHtml(offer.roleName)}</span>
        </div>
        ${attendees}
      </div>

      ${payLine}
      ${notes}

      <div class="offer-by">Offered by: <strong>${escHtml(offer.managerName)}</strong></div>

      <div class="offer-actions">
        <button class="offer-btn offer-btn--accept">I'm In ✓</button>
        <button class="offer-btn offer-btn--decline">Can't Make It ✗</button>
      </div>
    </div>`;
}

function renderSkeletons(count) {
  return Array.from({ length: count }, () => `
    <div class="offer-skeleton">
      <div class="skel skel-line skel-short"></div>
      <div class="skel skel-line skel-long"></div>
      <div class="skel skel-line skel-medium"></div>
      <div class="skel skel-line skel-short"></div>
      <div class="skel skel-buttons"></div>
    </div>`).join("");
}

function formatDateRange(startIso, endIso) {
  const start = new Date(startIso);
  const opts = { weekday: "short", month: "short", day: "numeric" };
  const datePart = start.toLocaleDateString("en-US", opts);
  const startTime = start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (!endIso) return `${datePart} · ${startTime}`;
  const end = new Date(endIso);
  const endTime = end.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${datePart} · ${startTime}–${endTime}`;
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
      role:      profile.role,
    });
  } catch (e) {
    console.warn("Chat profile write failed:", e);
  }

  // Start on Chats (default), then load offers in background for badge
  showSection("chats");
  initChat(chatSection, profile, user.uid);
  loadOffers();
});

// ── Logout ────────────────────────────────────────────────────────────────────
btnLogout.addEventListener("click", async () => {
  destroyChat();
  await signOut(auth);
  sessionStorage.removeItem("userProfile");
  window.location.href = "/frontend/auth.html";
});
