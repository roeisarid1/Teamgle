// employee-dashboard.js — shift-centric employee experience

import { auth }                        from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { writeUserProfile }            from "./chat-service.js";
import { initChat, destroyChat }       from "./chat-ui.js";

const API_BASE = "http://localhost:5000/api";

// ── DOM refs ──────────────────────────────────────────────────────────────────
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
const shiftsBadge      = document.getElementById("shifts-badge");

const MOBILE_BREAKPOINT = 768;

// ── Sidebar ───────────────────────────────────────────────────────────────────
function setSidebarOpen(open) {
  sidebar.classList.toggle("collapsed", !open);
  btnSidebarReopen.classList.toggle("visible", !open);
  if (sidebarBackdrop)
    sidebarBackdrop.classList.toggle("visible", open && window.innerWidth <= MOBILE_BREAKPOINT);
}

if (window.innerWidth <= MOBILE_BREAKPOINT) setSidebarOpen(false);
window.addEventListener("resize", () => {
  if (window.innerWidth <= MOBILE_BREAKPOINT) setSidebarOpen(false);
  else { setSidebarOpen(true); sidebarBackdrop?.classList.remove("visible"); }
});
btnHamburger.addEventListener("click",     () => setSidebarOpen(false));
btnSidebarReopen.addEventListener("click", () => setSidebarOpen(true));
sidebarBackdrop?.addEventListener("click", () => setSidebarOpen(false));

// ── Section switching ─────────────────────────────────────────────────────────
function showSection(sectionId) {
  document.querySelectorAll(".page-section").forEach(el => {
    el.style.display = el.dataset.section === sectionId ? "" : "none";
  });
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.section === sectionId);
  });
  pageContent.classList.toggle("chat-mode", sectionId === "chats");
  lucide.createIcons();
  if (sectionId === "my-shifts") loadMyShifts();
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

// ── HTML escape ───────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Date/time helpers ─────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function fmtDateRange(startIso, endIso) {
  if (!startIso) return "";
  const d    = new Date(startIso);
  const date = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const t1   = fmtTime(startIso);
  return endIso ? `${date} · ${t1}–${fmtTime(endIso)}` : `${date} · ${t1}`;
}
function toDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toISOString().slice(0, 16);
}
function isPast(iso) {
  if (!iso) return false;
  return new Date(iso) < new Date();
}

// ── My Shifts state ───────────────────────────────────────────────────────────
let _msOffers       = null;
let _msApplications = null;
let _msBriefs       = null;
let _msActiveTab    = "offers";
let _msLoading      = false;

// ── Load all shift data in parallel ──────────────────────────────────────────
async function loadMyShifts() {
  if (_msLoading) return;
  _msLoading = true;

  // Show skeleton on all panels
  ["offers", "upcoming", "needs-action", "history"].forEach(tab => {
    const el = document.getElementById(`ms-panel-${tab}`);
    if (el) el.innerHTML = renderSkeletons(2);
  });
  activateMsTab(_msActiveTab, false /* don't re-render yet */);

  try {
    const token = await getToken();
    const [offersRes, appsRes, briefsRes] = await Promise.all([
      fetch(`${API_BASE}/shifts/my-offers`,       { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE}/shifts/my-applications`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE}/events/my-briefs`,        { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    _msOffers       = offersRes.ok       ? await offersRes.json()  : [];
    _msApplications = appsRes.ok         ? await appsRes.json()    : [];
    _msBriefs       = briefsRes.ok       ? await briefsRes.json()  : [];
  } catch {
    _msOffers = _msApplications = _msBriefs = [];
  } finally {
    _msLoading = false;
  }

  // Compute needs-action count
  const now = new Date();
  const needsActionCount = (_msApplications ?? []).filter(s => {
    if (s.status !== "manager_approved") return false;
    if (new Date(s.eventEnd || s.shiftEnd || s.eventStart || s.shiftStart || 0) > now) return false;
    const missingHours = !s.actualStart || !s.actualEnd;
    const hasUnacked   = getBriefsForShift(s).some(b => !b.isAcknowledged);
    return missingHours || hasUnacked;
  }).length;

  // Update nav badge (offers + needs-action)
  const pendingOffers = (_msOffers ?? []).length;
  const totalBadge    = pendingOffers + needsActionCount;
  shiftsBadge.textContent   = totalBadge;
  shiftsBadge.style.display = totalBadge > 0 ? "" : "none";

  // Offers tab badge
  const offersBadge = document.getElementById("ms-badge-offers");
  if (offersBadge) {
    offersBadge.textContent   = pendingOffers;
    offersBadge.style.display = pendingOffers > 0 ? "" : "none";
  }

  // Needs Action tab badge
  const naBadge = document.getElementById("ms-badge-needs-action");
  if (naBadge) {
    naBadge.textContent   = needsActionCount;
    naBadge.style.display = needsActionCount > 0 ? "" : "none";
  }

  renderActiveTab();
}

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelector(".ms-tab-bar").addEventListener("click", e => {
  const tab = e.target.closest("[data-mstab]");
  if (!tab) return;
  activateMsTab(tab.dataset.mstab);
});

function activateMsTab(name, render = true) {
  _msActiveTab = name;
  document.querySelectorAll(".ms-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.mstab === name);
  });
  document.querySelectorAll(".ms-panel").forEach(p => {
    p.style.display = p.id === `ms-panel-${name}` ? "" : "none";
  });
  if (render) renderActiveTab();
}

function renderActiveTab() {
  switch (_msActiveTab) {
    case "offers":       renderOffersTab();       break;
    case "upcoming":     renderUpcomingTab();     break;
    case "needs-action": renderNeedsActionTab();  break;
    case "history":      renderHistoryTab();      break;
    default: break;
  }
}

// ── Empty / error states ──────────────────────────────────────────────────────
function emptyState(icon, msg, sub = "") {
  return `<div class="offers-empty">
    <i data-lucide="${escHtml(icon)}" style="width:48px;height:48px;color:var(--blue-light)"></i>
    <p>${escHtml(msg)}${sub ? `<br><span>${escHtml(sub)}</span>` : ""}</p>
  </div>`;
}

function renderSkeletons(n) {
  return Array.from({ length: n }, () => `
    <div class="offer-skeleton">
      <div class="skel skel-line skel-short"></div>
      <div class="skel skel-line skel-long"></div>
      <div class="skel skel-line skel-medium"></div>
      <div class="skel skel-buttons"></div>
    </div>`).join("");
}

// ────────────────────────────────────────────────────────────────────────────
//  OFFERS TAB
// ────────────────────────────────────────────────────────────────────────────
function renderOffersTab() {
  const panel = document.getElementById("ms-panel-offers");
  if (!panel) return;

  if (_msOffers === null) { panel.innerHTML = renderSkeletons(2); lucide.createIcons(); return; }
  if (_msOffers.length === 0) {
    panel.innerHTML = emptyState("inbox", "No job offers right now.", "Check back later.");
    lucide.createIcons(); return;
  }

  panel.innerHTML = _msOffers.map(o => renderOfferCard(o)).join("");
  lucide.createIcons();

  panel.querySelectorAll(".offer-card[data-shift-id]").forEach(card => {
    const shiftId = card.dataset.shiftId;
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
        // Remove from local cache and re-render
        _msOffers = _msOffers.filter(o => o.shiftId !== shiftId);
        // Refresh badge
        const offersBadge = document.getElementById("ms-badge-offers");
        if (offersBadge) {
          offersBadge.textContent   = _msOffers.length;
          offersBadge.style.display = _msOffers.length > 0 ? "" : "none";
        }
        // Also invalidate applications cache so Upcoming/Past refresh
        _msApplications = null;
        renderOffersTab();
      } catch {
        btnAccept.disabled  = false;
        btnDecline.disabled = false;
        btnAccept.textContent  = "I'm In ✓";
        btnDecline.textContent = "Can't Make It ✗";
      }
    }

    btnAccept.addEventListener("click",  () => respond(true));
    btnDecline.addEventListener("click", () => respond(false));
  });
}

function renderOfferCard(o) {
  const dateStr = fmtDateRange(o.plannedStartTime || o.shiftStartTime, o.plannedEndTime || o.shiftEndTime);
  const payLine = o.payRatePerHour > 0
    ? `<div class="offer-pay">₪${Number(o.payRatePerHour).toFixed(2)}<span>/hr</span></div>` : "";
  const loc = o.eventLocation
    ? `<div class="offer-meta-item"><i data-lucide="map-pin" class="offer-icon"></i><span>${escHtml(o.eventLocation)}</span></div>` : "";
  const notes = o.notes
    ? `<blockquote class="offer-notes">${escHtml(o.notes)}</blockquote>` : "";

  return `
    <div class="offer-card" data-shift-id="${escHtml(o.shiftId)}">
      <div class="offer-card-header">
        <div class="offer-project-name">${escHtml(o.projectName)}</div>
        ${o.eventType ? `<span class="offer-event-type-badge">${capitalize(o.eventType)}</span>` : ""}
      </div>
      <h3 class="offer-event-name">${escHtml(o.eventName)}</h3>
      ${dateStr ? `<div class="offer-meta-item offer-date"><i data-lucide="calendar" class="offer-icon"></i><span>${escHtml(dateStr)}</span></div>` : ""}
      <div class="offer-meta-row">
        ${loc}
        <div class="offer-meta-item">
          <i data-lucide="tag" class="offer-icon"></i>
          <span class="offer-role-chip">${escHtml(o.roleName)}</span>
        </div>
      </div>
      ${payLine}
      ${notes}
      <div class="offer-by">Offered by: <strong>${escHtml(o.managerName)}</strong></div>
      <div class="offer-actions">
        <button class="offer-btn offer-btn--accept">I'm In ✓</button>
        <button class="offer-btn offer-btn--decline">Can't Make It ✗</button>
      </div>
    </div>`;
}

// ────────────────────────────────────────────────────────────────────────────
//  UPCOMING TAB
// ────────────────────────────────────────────────────────────────────────────
async function renderUpcomingTab() {
  const panel = document.getElementById("ms-panel-upcoming");
  if (!panel) return;

  if (_msApplications === null) {
    panel.innerHTML = renderSkeletons(2);
    lucide.createIcons();
    await _fetchApplications();
  }

  const now     = new Date();
  const upcoming = (_msApplications ?? []).filter(
    s => s.status === "manager_approved" && new Date(s.eventEnd || s.shiftEnd || s.eventStart || s.shiftStart || 0) > now
  );

  if (upcoming.length === 0) {
    panel.innerHTML = emptyState("calendar", "No upcoming shifts.", "Your confirmed upcoming shifts will appear here.");
    lucide.createIcons(); return;
  }

  panel.innerHTML = upcoming.map(s => renderShiftCard(s, { showAttendance: false })).join("");
  lucide.createIcons();
  wireShiftCards(panel);
}

// ────────────────────────────────────────────────────────────────────────────
//  NEEDS ACTION TAB — past approved shifts still requiring employee input
// ────────────────────────────────────────────────────────────────────────────
async function renderNeedsActionTab() {
  const panel = document.getElementById("ms-panel-needs-action");
  if (!panel) return;

  if (_msApplications === null) {
    panel.innerHTML = renderSkeletons(2);
    lucide.createIcons();
    await _fetchApplications();
  }

  const now  = new Date();
  const list = (_msApplications ?? []).filter(s => {
    if (s.status !== "manager_approved") return false;
    if (new Date(s.eventEnd || s.shiftEnd || s.eventStart || s.shiftStart || 0) > now) return false;
    return (!s.actualStart || !s.actualEnd) || getBriefsForShift(s).some(b => !b.isAcknowledged);
  });

  if (list.length === 0) {
    panel.innerHTML = emptyState("check-circle", "All done!", "No shifts are waiting for your input.");
    lucide.createIcons(); return;
  }

  panel.innerHTML = list.map(s => renderShiftCard(s, { showAttendance: true })).join("");
  lucide.createIcons();
  wireShiftCards(panel);
}

async function _fetchApplications() {
  try {
    const token = await getToken();
    const [appsRes, briefsRes] = await Promise.all([
      fetch(`${API_BASE}/shifts/my-applications`, { headers: { Authorization: `Bearer ${token}` } }),
      _msBriefs === null
        ? fetch(`${API_BASE}/events/my-briefs`,   { headers: { Authorization: `Bearer ${token}` } })
        : Promise.resolve(null),
    ]);
    if (appsRes.ok)           _msApplications = await appsRes.json();
    if (briefsRes?.ok)        _msBriefs       = await briefsRes.json();
  } catch { _msApplications = []; }
}

// ────────────────────────────────────────────────────────────────────────────
//  HISTORY TAB — completed shifts + rejected / canceled / pending approval
// ────────────────────────────────────────────────────────────────────────────
async function renderHistoryTab() {
  const panel = document.getElementById("ms-panel-history");
  if (!panel) return;

  if (_msApplications === null) {
    panel.innerHTML = renderSkeletons(2);
    lucide.createIcons();
    await _fetchApplications();
  }

  const now = new Date();

  // Past approved shifts that no longer need action (completed)
  const completed = (_msApplications ?? []).filter(s => {
    if (s.status !== "manager_approved") return false;
    if (new Date(s.eventEnd || s.shiftEnd || s.eventStart || s.shiftStart || 0) > now) return false;
    return (s.actualStart && s.actualEnd) && !getBriefsForShift(s).some(b => !b.isAcknowledged);
  });

  // Non-approved shifts (pending / rejected / canceled)
  const other = (_msApplications ?? []).filter(s => s.status !== "manager_approved");

  if (completed.length === 0 && other.length === 0) {
    panel.innerHTML = emptyState("archive", "No history yet.", "Completed and past shifts will appear here.");
    lucide.createIcons(); return;
  }

  const groups = [];

  if (completed.length > 0) {
    groups.push({ label: "Completed", icon: "check-circle", items: completed, showAttendance: true });
  }

  const statusGroups = {
    employee_request:          { label: "Pending Manager Approval", icon: "clock"    },
    manager_reject:            { label: "Not Selected",             icon: "x-circle" },
    manager_approved_canceled: { label: "Canceled",                 icon: "slash"    },
  };
  const byStatus = {};
  other.forEach(s => { (byStatus[s.status] ??= []).push(s); });
  Object.entries(byStatus).forEach(([status, shifts]) => {
    const g = statusGroups[status] ?? { label: status, icon: "info" };
    groups.push({ label: g.label, icon: g.icon, items: shifts, showAttendance: false });
  });

  panel.innerHTML = groups.map(g => `
    <div class="ms-group">
      <div class="ms-group-header">
        <i data-lucide="${escHtml(g.icon)}" class="ms-group-icon"></i>
        <span>${escHtml(g.label)}</span>
        <span class="ms-group-count">${g.items.length}</span>
      </div>
      ${g.items.map(s => renderShiftCard(s, { showAttendance: g.showAttendance, compact: !g.showAttendance })).join("")}
    </div>`).join("");
  lucide.createIcons();
  wireShiftCards(panel);
}

// ────────────────────────────────────────────────────────────────────────────
//  COLLAPSIBLE SHIFT CARD — unified card for all tabs
// ────────────────────────────────────────────────────────────────────────────

// Derive reporting status from shift data
function _shiftStatus(shift) {
  if (shift.paymentStatus === "paid")    return "paid";
  if (shift.approvedRegularHours != null || shift.approvedOvertimeHours != null) return "approved";
  if (shift.actualStart || shift.actualEnd) return "submitted";
  return "not-reported";
}

// opts: { showAttendance: bool, compact: bool }
function renderShiftCard(shift, opts = {}) {
  const { showAttendance = false, compact = false } = opts;
  const briefs      = getBriefsForShift(shift);
  const unackedBriefs = briefs.filter(b => !b.isAcknowledged);
  const missingHours  = showAttendance && (!shift.actualStart || !shift.actualEnd);

  const dateStr    = fmtDateRange(shift.eventStart || shift.shiftStart, shift.eventEnd || shift.shiftEnd);
  const shiftTimes = (shift.shiftStart || shift.shiftEnd)
    ? `${fmtTime(shift.shiftStart)} – ${fmtTime(shift.shiftEnd)}` : "";

  // Action flags (only meaningful when showAttendance)
  const flags = [];
  if (missingHours)          flags.push(`<span class="ms-action-flag ms-action-flag--hours">Hours not reported</span>`);
  if (unackedBriefs.length)  flags.push(`<span class="ms-action-flag ms-action-flag--briefs">${unackedBriefs.length} brief${unackedBriefs.length > 1 ? "s" : ""} pending</span>`);
  const flagsHtml = flags.length ? `<div class="ms-action-flags">${flags.join("")}</div>` : "";

  // Status badge for header
  const statusBadge = shift.status === "manager_approved"
    ? `<span class="ms-approved-badge">✓ Approved</span>` : "";

  // Detail sections
  const briefsSection     = _renderDetailBriefs(briefs);
  const attendanceSection = showAttendance ? _renderDetailAttendance(shift)
    : `<div class="ms-detail-section"><div class="ms-detail-section-title"><i data-lucide="clock" style="width:14px;height:14px"></i> Attendance</div><p class="ms-detail-note">Attendance reporting is available after the event ends.</p></div>`;
  const statusSection     = _renderDetailStatus(shift);

  return `
    <div class="ms-shift-card${compact ? " ms-shift-card--compact" : ""}"
         data-shift-id="${escHtml(shift.shiftId)}"
         data-event-id="${escHtml(shift.eventId ?? "")}"
         data-project-id="${escHtml(shift.projectId ?? "")}">
      <div class="ms-card-header">
        <div class="ms-shift-info">
          <div class="ms-shift-meta">
            <span class="ms-shift-project">${escHtml(shift.projectName)}</span>
            ${statusBadge}
          </div>
          <h3 class="ms-shift-event">${escHtml(shift.eventName)}</h3>
          <div class="ms-shift-details">
            ${dateStr ? `<div class="offer-meta-item"><i data-lucide="calendar" class="offer-icon"></i><span>${escHtml(dateStr)}</span></div>` : ""}
            ${shift.eventLocation ? `<div class="offer-meta-item"><i data-lucide="map-pin" class="offer-icon"></i><span>${escHtml(shift.eventLocation)}</span></div>` : ""}
            ${shiftTimes ? `<div class="offer-meta-item"><i data-lucide="clock" class="offer-icon"></i><span>${escHtml(shiftTimes)}</span></div>` : ""}
            <div class="offer-meta-item"><i data-lucide="tag" class="offer-icon"></i><span class="offer-role-chip">${escHtml(shift.roleName)}</span></div>
          </div>
          ${flagsHtml}
        </div>
        <button class="ms-open-shift-btn" aria-expanded="false">Open Shift</button>
      </div>
      <div class="ms-card-body" hidden>
        ${briefsSection}
        ${attendanceSection}
        ${statusSection}
      </div>
    </div>`;
}

function _renderDetailBriefs(briefs) {
  const items = briefs.length === 0
    ? `<p class="ms-detail-note">No briefings for this shift.</p>`
    : briefs.map(b => {
        const acked  = b.isAcknowledged;
        const ackedAt = b.acknowledgedAt ? fmtDate(b.acknowledgedAt) : "";
        return `
          <div class="ms-brief-item${acked ? " ms-brief-item--acked" : ""}" data-brief-id="${escHtml(b.briefId)}">
            <div class="ms-brief-item-header">
              <span class="ms-brief-item-title">${escHtml(b.title)}</span>
              ${acked
                ? `<span class="brief-acked-badge">✓ Acknowledged${ackedAt ? ` · ${ackedAt}` : ""}</span>`
                : `<span class="brief-unread-dot"></span>`}
            </div>
            <div class="ms-brief-item-content">${escHtml(b.content)}</div>
            ${!acked ? `<button class="ms-brief-ack-btn">I have read and acknowledge</button>` : ""}
          </div>`;
      }).join("");

  return `
    <div class="ms-detail-section">
      <div class="ms-detail-section-title">
        <i data-lucide="file-text" style="width:14px;height:14px"></i>
        Briefings
      </div>
      ${items}
    </div>`;
}

function _renderDetailAttendance(shift) {
  const isApproved = shift.approvedRegularHours != null || shift.approvedOvertimeHours != null;
  return `
    <div class="ms-detail-section ms-time-report">
      <div class="ms-detail-section-title">
        <i data-lucide="clock" style="width:14px;height:14px"></i>
        Attendance & Hours Reporting
      </div>
      <div class="ms-time-quick-btns">
        <div class="ms-clock-btn-wrap">
          <button class="ms-clock-btn ms-clock-btn--in" data-quick="start"${isApproved ? " disabled" : ""} title="I Arrived — stamp current time">
            <i data-lucide="log-in" style="width:22px;height:22px"></i>
          </button>
          <span class="ms-clock-btn-label">I Arrived</span>
        </div>
        <div class="ms-clock-btn-wrap">
          <button class="ms-clock-btn ms-clock-btn--out" data-quick="end"${isApproved ? " disabled" : ""} title="I Left — stamp current time">
            <i data-lucide="log-out" style="width:22px;height:22px"></i>
          </button>
          <span class="ms-clock-btn-label">I Left</span>
        </div>
      </div>
      <div class="ms-time-report-fields">
        <div class="ms-time-field">
          <label class="ms-time-label">Actual Arrival</label>
          <input type="datetime-local" class="ms-time-input" name="actualStart"
                 value="${escHtml(toDatetimeLocal(shift.actualStart))}"${isApproved ? " readonly" : ""}>
        </div>
        <div class="ms-time-field">
          <label class="ms-time-label">Actual Departure</label>
          <input type="datetime-local" class="ms-time-input" name="actualEnd"
                 value="${escHtml(toDatetimeLocal(shift.actualEnd))}"${isApproved ? " readonly" : ""}>
        </div>
      </div>
      ${isApproved
        ? `<p class="ms-detail-note ms-detail-note--approved">✓ Hours approved by manager — contact manager to request changes.</p>`
        : `<div class="ms-time-actions">
             <button class="ms-time-save-btn">Save Hours</button>
             <span class="ms-time-save-status" style="display:none"></span>
           </div>`}
    </div>`;
}

function _renderDetailStatus(shift) {
  const status   = _shiftStatus(shift);
  const steps    = [
    { key: "not-reported", label: "Not Reported" },
    { key: "submitted",    label: "Submitted"    },
    { key: "approved",     label: "Approved"     },
    { key: "paid",         label: "Paid"         },
  ];
  const currentIdx = steps.findIndex(s => s.key === status);

  const stepsHtml = steps.map((step, i) => `
    <div class="ms-status-step${i < currentIdx ? " ms-status-step--done" : ""}${i === currentIdx ? " ms-status-step--current" : ""}">
      <div class="ms-status-dot"></div>
      <span class="ms-status-label">${escHtml(step.label)}</span>
    </div>`).join(`<div class="ms-status-connector"></div>`);

  return `
    <div class="ms-detail-section">
      <div class="ms-detail-section-title">
        <i data-lucide="activity" style="width:14px;height:14px"></i>
        Status
      </div>
      <div class="ms-status-track">${stepsHtml}</div>
    </div>`;
}

// ────────────────────────────────────────────────────────────────────────────
//  WIRE SHIFT CARD INTERACTIONS
// ────────────────────────────────────────────────────────────────────────────
function wireShiftCards(panel) {
  // "Open Shift" / "Close Shift" toggle
  panel.querySelectorAll(".ms-open-shift-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".ms-shift-card");
      const body = card?.querySelector(".ms-card-body");
      if (!body) return;
      const opening = body.hidden;
      body.hidden = !opening;
      btn.textContent      = opening ? "Close Shift" : "Open Shift";
      btn.setAttribute("aria-expanded", String(opening));
      if (opening) lucide.createIcons({ el: body });
    });
  });

  // Quick clock-in / clock-out buttons
  panel.querySelectorAll("[data-quick]").forEach(btn => {
    btn.addEventListener("click", () => {
      const section   = btn.closest(".ms-time-report");
      if (!section) return;
      const fieldName = btn.dataset.quick === "start" ? "actualStart" : "actualEnd";
      const input     = section.querySelector(`[name="${fieldName}"]`);
      if (!input) return;
      input.value = toDatetimeLocal(new Date().toISOString());
      input.classList.add("ms-time-input--flash");
      setTimeout(() => input.classList.remove("ms-time-input--flash"), 600);
    });
  });

  // Brief acknowledge buttons
  panel.querySelectorAll(".ms-brief-ack-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const item    = btn.closest("[data-brief-id]");
      const briefId = item?.dataset.briefId;
      if (!briefId) return;

      btn.disabled    = true;
      btn.textContent = "Saving…";
      try {
        const token = await getToken();
        const res = await fetch(
          `${API_BASE}/events/briefs/${encodeURIComponent(briefId)}/acknowledge`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error();

        // Update local brief cache
        const cached = (_msBriefs ?? []).find(b => b.briefId === briefId);
        if (cached) { cached.isAcknowledged = true; cached.acknowledgedAt = new Date().toISOString(); }

        // Update UI in-place
        item.classList.add("ms-brief-item--acked");
        btn.remove();
        item.querySelector(".brief-unread-dot")?.remove();
        const titleRow = item.querySelector(".ms-brief-item-header");
        if (titleRow) {
          const badge = document.createElement("span");
          badge.className = "brief-acked-badge";
          badge.textContent = "✓ Acknowledged";
          titleRow.appendChild(badge);
        }

        // Refresh unread count in the briefs toggle
        const section = item.closest(".ms-briefs-section");
        if (section) {
          const remaining = section.querySelectorAll(".ms-brief-item:not(.ms-brief-item--acked)").length;
          const unreadEl  = section.querySelector(".ms-briefs-unread");
          const allReadEl = section.querySelector(".ms-briefs-all-read");
          if (remaining === 0) {
            if (unreadEl) { unreadEl.className = "ms-briefs-all-read"; unreadEl.textContent = "All briefs acknowledged"; }
          } else if (unreadEl) {
            unreadEl.textContent = `${remaining} unread brief${remaining !== 1 ? "s" : ""}`;
          }
          if (allReadEl && remaining === 0) allReadEl.textContent = "All briefs acknowledged";
        }

        // Update nav badge
        const unreadTotal = (_msBriefs ?? []).filter(b => !b.isAcknowledged).length + (_msOffers?.length ?? 0);
        shiftsBadge.textContent   = unreadTotal;
        shiftsBadge.style.display = unreadTotal > 0 ? "" : "none";

      } catch {
        btn.disabled    = false;
        btn.textContent = "I acknowledge this brief";
      }
    });
  });

  // Time report save buttons
  panel.querySelectorAll(".ms-time-save-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const section  = btn.closest(".ms-time-report");
      const card     = btn.closest(".ms-shift-card");
      const shiftId  = card?.dataset.shiftId;
      if (!shiftId || !section) return;

      const startVal = section.querySelector('[name="actualStart"]').value;
      const endVal   = section.querySelector('[name="actualEnd"]').value;
      const statusEl = section.querySelector(".ms-time-save-status");

      btn.disabled    = true;
      btn.textContent = "Saving…";

      try {
        const token = await getToken();
        const res = await fetch(
          `${API_BASE}/shifts/${encodeURIComponent(shiftId)}/report-hours`,
          {
            method:  "PATCH",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body:    JSON.stringify({
              actualStart: startVal || null,
              actualEnd:   endVal   || null,
            }),
          },
        );
        if (!res.ok) throw new Error();

        // Update cache
        const cached = (_msApplications ?? []).find(s => s.shiftId === shiftId);
        if (cached) {
          cached.actualStart = startVal || null;
          cached.actualEnd   = endVal   || null;
        }

        // Update reported badge
        const titleRow = section.querySelector(".ms-time-report-title");
        const pendBadge = titleRow?.querySelector(".ms-time-pending-badge");
        if (pendBadge) { pendBadge.className = "ms-time-reported-badge"; pendBadge.textContent = "Reported"; }

        if (statusEl) { statusEl.textContent = "Saved ✓"; statusEl.style.display = ""; }
        btn.textContent = "Save Hours";
        btn.disabled    = false;
        setTimeout(() => { if (statusEl) statusEl.style.display = "none"; }, 3000);

      } catch {
        if (statusEl) { statusEl.textContent = "Failed — try again"; statusEl.style.display = ""; }
        btn.textContent = "Save Hours";
        btn.disabled    = false;
      }
    });
  });
}

// ────────────────────────────────────────────────────────────────────────────
//  BRIEF HELPERS
// ────────────────────────────────────────────────────────────────────────────
function getBriefsForShift(shift) {
  return (_msBriefs ?? []).filter(b =>
    (b.eventId   && b.eventId   === shift.eventId)   ||
    (b.projectId && b.projectId === shift.projectId) ||
    (b.shiftId   && b.shiftId   === shift.shiftId)
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────
function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
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

  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  navUsername.textContent = fullName;
  infoName.textContent    = fullName;
  infoRole.textContent    = profile.role;
  infoCompany.textContent = profile.companyId || "—";

  try {
    await writeUserProfile(user.uid, {
      firstName: profile.firstName,
      lastName:  profile.lastName,
      email:     profile.email || "",
      companyId: profile.companyId,
      role:      profile.role,
    });
  } catch (e) { console.warn("Chat profile write failed:", e); }

  showSection("my-shifts");
});

// ── Logout ────────────────────────────────────────────────────────────────────
btnLogout.addEventListener("click", async () => {
  destroyChat();
  await signOut(auth);
  sessionStorage.removeItem("userProfile");
  window.location.href = "/frontend/auth.html";
});
