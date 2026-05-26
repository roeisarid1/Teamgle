// gamification.js — shared Shift Champions module (manager + employee dashboards)
import { _t }      from "./i18n.js";
import { API_BASE } from "./api-config.js";

const BADGE_META = {
  shift_champion: { en: "Shift Champion", he: "אלוף משמרות", cls: "gc-badge--gold"   },
  team_regular:   { en: "Team Regular",   he: "קבוע בצוות",  cls: "gc-badge--silver" },
  rising_star:    { en: "Rising Star",    he: "מתחיל חזק",   cls: "gc-badge--bronze" },
};

const MEDAL = ["🥇", "🥈", "🥉"];

// ── Public API ────────────────────────────────────────────────────────────────

export async function loadShiftChampions(containerId, getToken) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = _renderSkeleton();

  try {
    const token = await getToken();
    const res   = await fetch(`${API_BASE}/gamification/shift-champions?period=current_month`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    container.innerHTML = _renderPage(data);
  } catch {
    container.innerHTML = `<p class="gc-error">${_t("Failed to load champions.", "טעינת אלופי המשמרות נכשלה.")}</p>`;
  }
  if (window.lucide) lucide.createIcons();
}

// ── Render helpers ────────────────────────────────────────────────────────────

function _renderPage(list) {
  const eventsLabel  = _t("events", "אירועים");
  const monthLabel   = _t("this month", "החודש");

  return `
    <div class="gc-page">
      <div class="gc-header">
        <div class="gc-header-icon">🏆</div>
        <h1 class="gc-title">${_t("Shift Champions", "אלופי המשמרות")}</h1>
        <p class="gc-subtitle">${_t("How many events did we complete this month?", "כמה אירועים סיימנו החודש?")}</p>
      </div>

      ${list.length === 0 ? _renderEmpty() : _renderContent(list, eventsLabel, monthLabel)}
    </div>`;
}

function _renderEmpty() {
  return `
    <div class="gc-empty">
      <i data-lucide="calendar-x" style="width:48px;height:48px;color:var(--blue-light)"></i>
      <p>${_t("No completed events this month yet.", "עוד אין אירועים שהסתיימו החודש")}</p>
    </div>`;
}

function _renderContent(list, eventsLabel) {
  const top3 = list.slice(0, 3);
  const rest  = list.slice(3);

  return `
    ${_renderPodium(top3, eventsLabel)}
    ${rest.length > 0 || list.length > 3 ? _renderFullList(list, eventsLabel) : ""}`;
}

function _renderPodium(top3, eventsLabel) {
  // Classic podium order: 2nd (left), 1st (center), 3rd (right)
  const order = [top3[1], top3[0], top3[2]].filter(Boolean);

  const cols = order.map((w) => {
    const rankIdx = top3.indexOf(w);
    const colCls  = rankIdx === 0 ? "gc-podium-col--first"
                  : rankIdx === 1 ? "gc-podium-col--second"
                  :                 "gc-podium-col--third";
    return _renderPodiumCol(w, rankIdx, colCls, eventsLabel);
  });

  return `<div class="gc-podium">${cols.join("")}</div>`;
}

function _renderPodiumCol(worker, rankIdx, colCls, eventsLabel) {
  const medal    = MEDAL[rankIdx] ?? "";
  const badge    = worker.badge ? BADGE_META[worker.badge] : null;
  const initials = _initials(worker.name);
  const you      = worker.isCurrentUser
    ? `<span class="gc-you-tag">${_t("You", "את/ה")}</span>` : "";

  return `
    <div class="gc-podium-col ${colCls}${worker.isCurrentUser ? " gc-podium-col--you" : ""}">
      <div class="gc-podium-medal">${medal}</div>
      <div class="gc-podium-avatar">${initials}</div>
      <div class="gc-podium-name">${_esc(worker.name)}${you}</div>
      <div class="gc-podium-count">${worker.eventCount} <span>${eventsLabel}</span></div>
      ${badge ? `<span class="gc-badge ${badge.cls}">${_t(badge.en, badge.he)}</span>` : ""}
    </div>`;
}

function _renderFullList(list, eventsLabel) {
  const rows = list.map((w, i) => {
    const badge   = w.badge ? BADGE_META[w.badge] : null;
    const initials = _initials(w.name);
    const you      = w.isCurrentUser ? `<span class="gc-you-tag">${_t("You", "את/ה")}</span>` : "";

    return `
      <tr class="gc-row${w.isCurrentUser ? " gc-row--you" : ""}">
        <td class="gc-rank">${i < 3 ? MEDAL[i] : i + 1}</td>
        <td>
          <div class="gc-row-worker">
            <div class="gc-row-avatar">${initials}</div>
            <span class="gc-row-name">${_esc(w.name)}${you}</span>
          </div>
        </td>
        <td class="gc-count">${w.eventCount} <span class="gc-count-label">${eventsLabel}</span></td>
        <td>${badge ? `<span class="gc-badge ${badge.cls}">${_t(badge.en, badge.he)}</span>` : ""}</td>
      </tr>`;
  }).join("");

  return `
    <div class="gc-list-wrap">
      <h2 class="gc-list-title">${_t("Full Ranking", "דירוג מלא")}</h2>
      <table class="gc-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${_t("Employee", "עובד")}</th>
            <th>${_t("Events", "אירועים")}</th>
            <th>${_t("Badge", "תגית")}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function _renderSkeleton() {
  const rows = Array.from({ length: 5 }, () => `
    <div class="gc-skel-row">
      <div class="skel skel-line skel-short"></div>
      <div class="skel skel-line skel-long"></div>
    </div>`).join("");
  return `<div class="gc-skeleton">${rows}</div>`;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function _initials(name) {
  return (name ?? "")
    .split(" ")
    .slice(0, 2)
    .map(p => p[0] ?? "")
    .join("")
    .toUpperCase();
}

function _esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
