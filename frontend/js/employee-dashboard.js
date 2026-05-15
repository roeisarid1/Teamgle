// employee-dashboard.js — shift-centric employee experience

import { auth }                        from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { writeUserProfile }            from "./chat-service.js";
import { initChat, destroyChat, openEventChat, openShiftChat } from "./chat-ui.js";
import { initI18n, applyTranslations, _t } from "./i18n.js";
import { API_BASE } from "./api-config.js";

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
initI18n();

window.addEventListener("teamgle:languagechange", () => {
  applyTranslations();
  if (_msActiveTab) renderActiveTab();
  if (pageContent?.classList.contains("chat-mode")) {
    destroyChat();
    _chatInitialized = false;
    _initChatSection();
  }
});

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
  if (sectionId === "chats")    _initChatSection();
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

// ── Needs-action predicate (single source of truth) ──────────────────────────
// Returns true if this approved shift still requires employee action.
function _isNeedsAction(s) {
  if (s.status !== "manager_approved") return false;
  const now    = new Date();
  const isPast = new Date(s.eventEnd || s.shiftEnd || s.eventStart || s.shiftStart || 0) <= now;
  const hasUnacked = getBriefsForShift(s).some(b => !b.isAcknowledged);
  if (!isPast) return hasUnacked;                               // future: only unacked briefs
  return (!s.actualStart || !s.actualEnd) || hasUnacked;       // past: missing hours OR unacked briefs
}

// ── Auth state (set once onAuthStateChanged fires) ───────────────────────────
let _profile            = null;
let _currentFirebaseUid = null;
let _chatInitialized    = false;

function _initChatSection() {
  if (_chatInitialized) return;
  if (!_profile || !_currentFirebaseUid) return;
  _chatInitialized = true;
  const container = document.getElementById("section-chats");
  initChat(container, _profile, _currentFirebaseUid);
}

async function _openEmployeeEventChat(item) {
  if (!item?.eventId) return;
  _initChatSection();
  showSection("chats");
  await openEventChat({
    eventId: item.eventId,
    title: item.eventName || "Event Chat",
    subtitle: "Event chat",
    participantUids: [_currentFirebaseUid],
  });
}

async function _openEmployeeShiftChat(item) {
  if (!item?.shiftId) return;
  _initChatSection();
  showSection("chats");
  const role = item.roleName || "Shift";
  const time = item.shiftStart || item.shiftStartTime
    ? `${fmtTime(item.shiftStart || item.shiftStartTime)} – ${fmtTime(item.shiftEnd || item.shiftEndTime)}`
    : "";
  await openShiftChat({
    shiftId: item.shiftId,
    eventId: item.eventId || null,
    title: time ? `${role} · ${time}` : role,
    subtitle: item.eventName || "Shift chat",
    participantUids: [_currentFirebaseUid],
  });
}

// ── My Shifts state ───────────────────────────────────────────────────────────
let _msOffers       = null;
let _msApplications = null;
let _msBriefs       = null;
let _msActiveTab    = "offers";
let _msLoading      = false;

// ── Tab notification helpers (seen/unseen tracking via localStorage) ──────────
const _SEEN_KEY = { offers: "ms-seen-offers", upcoming: "ms-seen-upcoming", history: "ms-seen-history" };

function _getSeenIds(tab) {
  try { return new Set(JSON.parse(localStorage.getItem(_SEEN_KEY[tab]) || "[]")); }
  catch { return new Set(); }
}

function _saveSeenIds(tab, ids) {
  try {
    const merged = _getSeenIds(tab);
    ids.forEach(id => merged.add(id));
    localStorage.setItem(_SEEN_KEY[tab], JSON.stringify([...merged]));
  } catch {}
}

function _tabItems(tab) {
  const now = new Date();
  if (tab === "offers")
    return (_msOffers ?? [])
      .filter(o => (o.status || "manager_offer_sent") === "manager_offer_sent")
      .map(o => o.shiftId);
  if (tab === "upcoming")
    return (_msApplications ?? [])
      .filter(s => s.status === "manager_approved" &&
        new Date(s.eventEnd || s.shiftEnd || s.eventStart || s.shiftStart || 0) > now)
      .map(s => s.shiftId);
  if (tab === "history")
    return (_msApplications ?? [])
      .filter(s => s.status === "manager_approved" &&
        new Date(s.eventEnd || s.shiftEnd || s.eventStart || s.shiftStart || 0) <= now)
      .map(s => s.shiftId);
  return [];
}

function _updateTabBadge(tab) {
  const badge = document.getElementById(`ms-badge-${tab}`);
  if (!badge) return;
  const seen  = _getSeenIds(tab);
  const count = _tabItems(tab).filter(id => !seen.has(id)).length;
  badge.textContent   = count;
  badge.style.display = count > 0 ? "" : "none";
}

function _markTabSeen(tab) {
  _saveSeenIds(tab, _tabItems(tab));
  const badge = document.getElementById(`ms-badge-${tab}`);
  if (badge) badge.style.display = "none";
}

// ── Load all shift data in parallel ──────────────────────────────────────────
async function loadMyShifts() {
  if (_msLoading) return;
  _msLoading = true;

  // Show skeleton on all panels
  ["offers", "upcoming", "history"].forEach(tab => {
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

  // Update unseen badges for all tabs; active tab is marked seen immediately
  ["offers", "upcoming", "history"].forEach(tab => {
    if (tab === _msActiveTab) _markTabSeen(tab);
    else _updateTabBadge(tab);
  });

  // Nav badge = total unseen across offers + upcoming
  const navCount =
    _tabItems("offers").filter(id => !_getSeenIds("offers").has(id)).length +
    _tabItems("upcoming").filter(id => !_getSeenIds("upcoming").has(id)).length;
  shiftsBadge.textContent   = navCount;
  shiftsBadge.style.display = navCount > 0 ? "" : "none";

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
  // Mark items in the tab being opened as seen
  _markTabSeen(name);
  if (render) renderActiveTab();
}

function renderActiveTab() {
  switch (_msActiveTab) {
    case "offers":   renderOffersTab();   break;
    case "upcoming": renderUpcomingTab(); break;
    case "history":  renderHistoryTab();  break;
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
    panel.innerHTML = emptyState("inbox", _t("No job offers right now.", "אין הצעות עבודה כרגע."), _t("Check back later.", "בדוק שוב מאוחר יותר."));
    lucide.createIcons(); return;
  }

  panel.innerHTML = _msOffers.map(o => renderOfferCard(o)).join("");
  lucide.createIcons();

  panel.querySelectorAll(".offer-card[data-shift-id]").forEach(card => {
    const shiftId = card.dataset.shiftId;
    const btnAccept  = card.querySelector(".offer-btn--accept");
    const btnDecline = card.querySelector(".offer-btn--decline");
    if (!btnAccept || !btnDecline) return;

    async function respond(accept) {
      btnAccept.disabled  = true;
      btnDecline.disabled = true;
      btnAccept.textContent  = accept ? _t("Saving…", "שומר…") : btnAccept.textContent;
      btnDecline.textContent = !accept ? _t("Saving…", "שומר…") : btnDecline.textContent;
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/shifts/${encodeURIComponent(shiftId)}/respond`, {
          method:  "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body:    JSON.stringify({ accept }),
        });
        if (!res.ok) throw new Error();
        // Keep the card visible, but mark the employee's response.
        const nextStatus = accept ? "employee_request" : "employee_request_canceled";
        _msOffers = _msOffers.map(o =>
          o.shiftId === shiftId ? { ...o, status: nextStatus } : o
        );
        // Refresh badge
        const offersBadge = document.getElementById("ms-badge-offers");
        if (offersBadge) {
          const pendingOffers = _msOffers.filter(o => (o.status || "manager_offer_sent") === "manager_offer_sent").length;
          offersBadge.textContent   = pendingOffers;
          offersBadge.style.display = pendingOffers > 0 ? "" : "none";
        }
        // Also invalidate applications cache so Upcoming/Past refresh
        _msApplications = null;
        renderOffersTab();
      } catch {
        btnAccept.disabled  = false;
        btnDecline.disabled = false;
        btnAccept.textContent  = _t("I'm In ✓", "אני פנוי ✓");
        btnDecline.textContent = _t("Can't Make It ✗", "לא יכול להגיע ✗");
      }
    }

    btnAccept.addEventListener("click",  () => respond(true));
    btnDecline.addEventListener("click", () => respond(false));
  });
}

function renderOfferCard(o) {
  const dateStr = fmtDateRange(o.plannedStartTime || o.shiftStartTime, o.plannedEndTime || o.shiftEndTime);
  const status = o.status || "manager_offer_sent";
  const isOpenOffer = status === "manager_offer_sent";
  const statusBadge =
    status === "employee_request"
      ? `<span class="offer-response-badge offer-response-badge--pending">${_t("Interested · pending manager approval", "מעוניין · ממתין לאישור מנהל")}</span>`
      : status === "employee_request_canceled"
        ? `<span class="offer-response-badge offer-response-badge--declined">${_t("Declined", "דחיתי")}</span>`
        : `<span class="offer-response-badge offer-response-badge--open">${_t("Response needed", "נדרשת תגובה")}</span>`;
  const payLine = o.payRatePerHour > 0
    ? `<div class="offer-pay">₪${Number(o.payRatePerHour).toFixed(2)}<span>/hr</span></div>` : "";
  const loc = o.eventLocation
    ? `<div class="offer-meta-item"><i data-lucide="map-pin" class="offer-icon"></i><span>${escHtml(o.eventLocation)}</span></div>` : "";
  const notes = o.notes
    ? `<blockquote class="offer-notes">${escHtml(o.notes)}</blockquote>` : "";

  return `
    <div class="offer-card" data-shift-id="${escHtml(o.shiftId)}" data-event-id="${escHtml(o.eventId ?? "")}">
      <div class="offer-card-header">
        <div class="offer-project-name">${escHtml(o.eventName)}</div>
        ${o.eventType ? `<span class="offer-event-type-badge">${capitalize(o.eventType)}</span>` : ""}
      </div>
      ${statusBadge}
      <h3 class="offer-event-name">${escHtml(o.roleName)}</h3>
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
      <div class="offer-by">${_t("Offered by:", "הוצע על ידי:")} <strong>${escHtml(o.managerName)}</strong></div>
      ${isOpenOffer
        ? `<div class="offer-actions">
            <button class="offer-btn offer-btn--accept">${_t("I'm In ✓", "אני פנוי ✓")}</button>
            <button class="offer-btn offer-btn--decline">${_t("Can't Make It ✗", "לא יכול להגיע ✗")}</button>
          </div>`
        : ""}
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

  const now = new Date();
  const upcoming = (_msApplications ?? []).filter(s => {
    if (s.status !== "manager_approved") return false;
    return new Date(s.eventEnd || s.shiftEnd || s.eventStart || s.shiftStart || 0) > now;
  });

  if (upcoming.length === 0) {
    panel.innerHTML = emptyState("calendar", _t("No upcoming shifts.", "אין משמרות קרובות."), _t("Your confirmed upcoming shifts will appear here.", "המשמרות המאושרות הקרובות שלך יופיעו כאן."));
    lucide.createIcons(); return;
  }

  panel.innerHTML = upcoming.map(s => renderShiftCard(s, { showAttendance: true })).join("");
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

  const list = (_msApplications ?? []).filter(_isNeedsAction);

  if (list.length === 0) {
    panel.innerHTML = emptyState("check-circle", _t("All done!", "הכל בסדר!"), _t("No shifts are waiting for your input.", "אין משמרות הממתינות לפעולה שלך."));
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
//  HISTORY TAB — past approved shifts where hours have been reported
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

  // All approved past shifts — whether or not hours are filled
  const past = (_msApplications ?? []).filter(s =>
    s.status === "manager_approved" &&
    new Date(s.eventEnd || s.shiftEnd || s.eventStart || s.shiftStart || 0) <= now
  );

  if (past.length === 0) {
    panel.innerHTML = emptyState("archive", _t("No history yet.", "אין היסטוריה עדיין."), _t("Past shifts will appear here — you can fill in your hours manually.", "משמרות שעברו יופיעו כאן — ניתן למלא שעות ידנית."));
    lucide.createIcons(); return;
  }

  panel.innerHTML = past.map(s => renderShiftCard(s, { showAttendance: true })).join("");
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
  const { compact = false, hideAttendance = false } = opts;
  const briefs      = getBriefsForShift(shift);
  const unackedBriefs = briefs.filter(b => !b.isAcknowledged);
  const shiftIsPast   = new Date(shift.eventEnd || shift.shiftEnd || shift.eventStart || shift.shiftStart || 0) <= new Date();
  const missingHours  = shiftIsPast && (!shift.actualStart || !shift.actualEnd);

  const dateStr    = fmtDateRange(shift.eventStart || shift.shiftStart, shift.eventEnd || shift.shiftEnd);
  const shiftTimes = (shift.shiftStart || shift.shiftEnd)
    ? `${fmtTime(shift.shiftStart)} – ${fmtTime(shift.shiftEnd)}` : "";

  const flags = [];
  if (missingHours)          flags.push(`<span class="ms-action-flag ms-action-flag--hours">${_t("Hours not reported", "שעות לא דווחו")}</span>`);
  if (unackedBriefs.length)  flags.push(`<span class="ms-action-flag ms-action-flag--briefs">${_t(`${unackedBriefs.length} brief${unackedBriefs.length > 1 ? "s" : ""} pending`, `${unackedBriefs.length} תדריכ${unackedBriefs.length > 1 ? "ים" : ""} ממתינ${unackedBriefs.length > 1 ? "ים" : ""} לאישור`)}</span>`);
  const flagsHtml = flags.length ? `<div class="ms-action-flags">${flags.join("")}</div>` : "";

  // Status badge for header
  const statusBadge = shift.status === "manager_approved"
    ? `<span class="ms-approved-badge">✓ ${_t("Approved", "מאושר")}</span>` : "";

  // Detail sections
  const briefsSection     = _renderDetailBriefs(briefs);
  const attendanceSection = hideAttendance ? "" : _renderDetailAttendance(shift);
  const statusSection     = _renderDetailStatus(shift);

  return `
    <div class="ms-shift-card${compact ? " ms-shift-card--compact" : ""}"
         data-shift-id="${escHtml(shift.shiftId)}"
         data-event-id="${escHtml(shift.eventId ?? "")}"
         data-project-id="${escHtml(shift.projectId ?? "")}">
      <div class="ms-card-header">
        <div class="ms-shift-info">
          <div class="ms-shift-meta">
            <span class="ms-shift-project">${escHtml(shift.roleName)}</span>
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
        <div class="ms-card-actions">
          <button class="ms-chat-btn" data-shift-chat="event" type="button" title="${_t("Event chat", "צ'אט אירוע")}">
            <i data-lucide="messages-square" style="width:16px;height:16px"></i>
            ${_t("Event", "אירוע")}
          </button>
          <button class="ms-chat-btn" data-shift-chat="shift" type="button" title="${_t("Shift chat", "צ'אט משמרת")}">
            <i data-lucide="message-square" style="width:16px;height:16px"></i>
            ${_t("Shift", "משמרת")}
          </button>
          <button class="ms-open-shift-btn" aria-expanded="false">${_t("Open Shift", "פתח משמרת")}</button>
        </div>
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
    ? `<p class="ms-detail-note">${_t("No briefings for this shift.", "אין תדריכים למשמרת זו.")}</p>`
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
            ${!acked ? `<button class="ms-brief-ack-btn">${_t("I have read and acknowledge", "קראתי ומאשר")}</button>` : ""}
          </div>`;
      }).join("");

  return `
    <div class="ms-detail-section">
      <div class="ms-detail-section-title">
        <i data-lucide="file-text" style="width:14px;height:14px"></i>
        ${_t("Briefings", "תדריכים")}
      </div>
      ${items}
    </div>`;
}

function _renderDetailAttendance(shift) {
  const isApproved = shift.approvedRegularHours != null || shift.approvedOvertimeHours != null;
  const isPast     = new Date(shift.eventEnd || shift.shiftEnd || shift.eventStart || shift.shiftStart || 0) <= new Date();

  // ── Upcoming shift: quick clock buttons only, no manual inputs ──────────
  if (!isPast) {
    const arrivedNote = shift.actualStart
      ? `<span class="ms-clock-recorded">${_t("Recorded:", "נרשם:")} ${fmtTime(shift.actualStart)}</span>`
      : `<span class="ms-clock-hint">${_t("Tap when you arrive", "הקש כשאתה מגיע")}</span>`;
    const leftNote = shift.actualEnd
      ? `<span class="ms-clock-recorded">${_t("Recorded:", "נרשם:")} ${fmtTime(shift.actualEnd)}</span>`
      : `<span class="ms-clock-hint">${_t("Tap when you leave", "הקש כשאתה עוזב")}</span>`;

    return `
      <div class="ms-detail-section ms-time-report">
        <div class="ms-detail-section-title">
          <i data-lucide="clock" style="width:14px;height:14px"></i>
          ${_t("Attendance", "נוכחות")}
        </div>
        <div class="ms-time-quick-btns">
          <div class="ms-clock-btn-wrap">
            <button class="ms-clock-btn ms-clock-btn--in" data-quick-direct="start"
                    ${shift.actualStart || isApproved ? " disabled" : ""}>
              <i data-lucide="log-in" style="width:22px;height:22px"></i>
            </button>
            <span class="ms-clock-btn-label">${_t("I Arrived", "הגעתי")}</span>
            ${arrivedNote}
          </div>
          <div class="ms-clock-btn-wrap">
            <button class="ms-clock-btn ms-clock-btn--out" data-quick-direct="end"
                    ${shift.actualEnd || isApproved ? " disabled" : ""}>
              <i data-lucide="log-out" style="width:22px;height:22px"></i>
            </button>
            <span class="ms-clock-btn-label">${_t("I Left", "עזבתי")}</span>
            ${leftNote}
          </div>
        </div>
        <span class="ms-time-save-status" style="display:none"></span>
      </div>`;
  }

  // ── Past shift: manual form only ─────────────────────────────────────────
  return `
    <div class="ms-detail-section ms-time-report">
      <div class="ms-detail-section-title">
        <i data-lucide="clock" style="width:14px;height:14px"></i>
        ${_t("Attendance & Hours Reporting", "נוכחות ודיווח שעות")}
      </div>
      <div class="ms-time-report-fields">
        <div class="ms-time-field">
          <label class="ms-time-label">${_t("Actual Arrival", "כניסה בפועל")}</label>
          <input type="datetime-local" class="ms-time-input" name="actualStart"
                 value="${escHtml(toDatetimeLocal(shift.actualStart))}"${isApproved ? " readonly" : ""}>
        </div>
        <div class="ms-time-field">
          <label class="ms-time-label">${_t("Actual Departure", "יציאה בפועל")}</label>
          <input type="datetime-local" class="ms-time-input" name="actualEnd"
                 value="${escHtml(toDatetimeLocal(shift.actualEnd))}"${isApproved ? " readonly" : ""}>
        </div>
      </div>
      ${isApproved
        ? `<p class="ms-detail-note ms-detail-note--approved">✓ ${_t("Hours approved by manager — contact manager to request changes.", "השעות אושרו על ידי המנהל — צור קשר עם המנהל לבקשת שינויים.")}</p>`
        : `<div class="ms-time-actions">
             <button class="ms-time-save-btn">${_t("Save Hours", "שמור שעות")}</button>
             <span class="ms-time-save-status" style="display:none"></span>
           </div>`}
    </div>`;
}

function _renderDetailStatus(shift) {
  const status   = _shiftStatus(shift);
  const steps    = [
    { key: "not-reported", label: _t("Not Reported", "לא דווח") },
    { key: "submitted",    label: _t("Submitted",    "הוגש")    },
    { key: "approved",     label: _t("Approved",     "אושר")    },
    { key: "paid",         label: _t("Paid",         "שולם")    },
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
        ${_t("Status", "סטטוס")}
      </div>
      <div class="ms-status-track">${stepsHtml}</div>
    </div>`;
}

// ────────────────────────────────────────────────────────────────────────────
//  WIRE SHIFT CARD INTERACTIONS
// ────────────────────────────────────────────────────────────────────────────
function wireShiftCards(panel) {
  panel.querySelectorAll("[data-shift-chat]").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const card = btn.closest(".ms-shift-card");
      const shiftId = card?.dataset.shiftId;
      const item = (_msApplications ?? []).find(s => s.shiftId === shiftId);
      if (!item) return;
      if (btn.dataset.shiftChat === "event") await _openEmployeeEventChat(item);
      else await _openEmployeeShiftChat(item);
    });
  });

  // "Open Shift" / "Close Shift" toggle
  panel.querySelectorAll(".ms-open-shift-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".ms-shift-card");
      const body = card?.querySelector(".ms-card-body");
      if (!body) return;
      const opening = body.hidden;
      body.hidden = !opening;
      btn.textContent      = opening ? _t("Close Shift", "סגור משמרת") : _t("Open Shift", "פתח משמרת");
      btn.setAttribute("aria-expanded", String(opening));
      if (opening) lucide.createIcons({ el: body });
    });
  });

  // Quick clock-in / clock-out (past shifts — fills the datetime input)
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

  // Quick clock-in / clock-out (upcoming shifts — saves directly to API)
  panel.querySelectorAll("[data-quick-direct]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const section  = btn.closest(".ms-time-report");
      const card     = btn.closest(".ms-shift-card");
      const shiftId  = card?.dataset.shiftId;
      if (!shiftId || !section) return;

      const field    = btn.dataset.quickDirect === "start" ? "actualStart" : "actualEnd";
      const nowIso   = new Date().toISOString();
      const statusEl = section.querySelector(".ms-time-save-status");

      btn.disabled = true;
      if (statusEl) { statusEl.textContent = _t("Saving…", "שומר…"); statusEl.style.display = ""; }

      try {
        const token = await getToken();
        const body  = { [field]: nowIso };
        // Preserve existing value for the other field
        const cached = (_msApplications ?? []).find(s => s.shiftId === shiftId);
        if (cached) {
          body.actualStart = field === "actualStart" ? nowIso : (cached.actualStart || null);
          body.actualEnd   = field === "actualEnd"   ? nowIso : (cached.actualEnd   || null);
        }
        const res = await fetch(
          `${API_BASE}/shifts/${encodeURIComponent(shiftId)}/report-hours`,
          {
            method:  "PATCH",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body:    JSON.stringify(body),
          },
        );
        if (!res.ok) throw new Error();

        if (statusEl) { statusEl.textContent = _t("Saved ✓", "נשמר ✓"); statusEl.style.display = ""; }
        setTimeout(async () => {
          if (statusEl) statusEl.style.display = "none";
          await _refreshShiftsData();
        }, 1200);

      } catch {
        btn.disabled = false;
        if (statusEl) { statusEl.textContent = _t("Failed — try again", "נכשל — נסה שוב"); }
        setTimeout(() => { if (statusEl) statusEl.style.display = "none"; }, 3000);
      }
    });
  });

  // Brief acknowledge buttons
  panel.querySelectorAll(".ms-brief-ack-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const item    = btn.closest("[data-brief-id]");
      const briefId = item?.dataset.briefId;
      if (!briefId) return;

      btn.disabled    = true;
      btn.textContent = _t("Saving…", "שומר…");
      try {
        const token = await getToken();
        const res = await fetch(
          `${API_BASE}/events/briefs/${encodeURIComponent(briefId)}/acknowledge`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error();

        btn.textContent = _t("✓ Acknowledged", "✓ אישרתי");
        // Brief acked — refresh full data after short delay
        setTimeout(() => _refreshShiftsData(), 800);

      } catch {
        btn.disabled    = false;
        btn.textContent = _t("I acknowledge this brief", "קראתי ואישרתי את התדריך");
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
      btn.textContent = _t("Saving…", "שומר…");

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

        if (statusEl) { statusEl.textContent = _t("Saved ✓", "נשמר ✓"); statusEl.style.display = ""; }
        btn.textContent = _t("Save Hours", "שמור שעות");
        btn.disabled    = false;
        setTimeout(() => _refreshShiftsData(), 1200);

      } catch {
        if (statusEl) { statusEl.textContent = _t("Failed — try again", "נכשל — נסה שוב"); statusEl.style.display = ""; }
        btn.textContent = _t("Save Hours", "שמור שעות");
        btn.disabled    = false;
      }
    });
  });
}

// Invalidate caches and reload the active tab
async function _refreshShiftsData() {
  _msOffers       = null;
  _msApplications = null;
  _msBriefs       = null;
  await loadMyShifts();
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
    window.location.href = "auth.html";
    return;
  }

  _profile = JSON.parse(sessionStorage.getItem("userProfile") || "null");
  if (!_profile || _profile.role !== "Employee") {
    alert(_t("Access denied. Employee accounts only.", "גישה נדחתה. חשבונות עובדים בלבד."));
    await signOut(auth);
    window.location.href = "auth.html";
    return;
  }
  _currentFirebaseUid = user.uid;

  const fullName = `${_profile.firstName} ${_profile.lastName}`.trim();
  navUsername.textContent = fullName;
  infoName.textContent    = fullName;
  infoRole.textContent    = _profile.role;
  infoCompany.textContent = _profile.companyId || "—";

  try {
    await writeUserProfile(user.uid, {
      firstName: _profile.firstName,
      lastName:  _profile.lastName,
      email:     _profile.email || "",
      companyId: _profile.companyId,
      role:      _profile.role,
    });
  } catch (e) { console.warn("Chat profile write failed:", e); }

  showSection("my-shifts");
});

// ── Logout ────────────────────────────────────────────────────────────────────
btnLogout.addEventListener("click", async () => {
  destroyChat();
  await signOut(auth);
  sessionStorage.removeItem("userProfile");
  window.location.href = "auth.html";
});
