/**
 * time-picker.js — Reusable analog clock time picker
 *
 * Usage:
 *   import { attachTimePicker } from './time-picker.js';
 *   attachTimePicker(inputElement);   // works on type="time" and type="datetime-local"
 *
 * The picker returns HH:MM to the input.
 * For datetime-local inputs it preserves the date part and updates only the time.
 */

// ── Clock geometry constants ──────────────────────────────────────────────────
const OUTER_R = 79;   // outer ring radius  (hours 1-12 / all minutes)
const INNER_R = 53;   // inner ring radius  (hours 0, 13-23)
const CENTER  = 100;  // clock center x = y

// 24-hour clock number sets — each array maps index → label value
// Index 0 is at the top (12 o'clock position), index n is at n*30 degrees.
const HOURS_OUTER = [12, 1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11];
const HOURS_INNER = [ 0, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const MINS        = [ 0,  5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

// ── Singleton state ───────────────────────────────────────────────────────────
let _popup = null;   // the popup DOM node (created once)
let _input = null;   // currently active <input>
let _mode  = 'h';   // 'h' = hour selection, 'm' = minute selection
let _h     = 0;
let _m     = 0;

function pad(n) { return String(n).padStart(2, '0'); }

// ─────────────────────────────────────────────────────────────────────────────
// CSS — injected once into <head>
// ─────────────────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('tp-styles')) return;
  const s = document.createElement('style');
  s.id = 'tp-styles';
  s.textContent = `
/* ── Time Picker popup ───────────────────────────────────────────────────── */
.tp-popup {
  position: absolute;
  z-index: 9999;
  width: 248px;
  background: var(--card, #fff);
  border-radius: var(--radius, 12px);
  border: 1px solid var(--border, #e5e7eb);
  box-shadow: 0 8px 40px rgba(0,0,0,.18);
  display: none;
  direction: ltr;            /* clock is always LTR */
  font-family: 'Inter', system-ui, sans-serif;
  overflow: hidden;
  user-select: none;
}
.tp-popup.tp-open { display: block; }

/* digital header */
.tp-digital {
  background: var(--blue, #5B7BF0);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px 0 12px;
}
.tp-seg {
  font-size: 38px;
  font-weight: 700;
  font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif;
  color: rgba(255,255,255,.5);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 8px;
  line-height: 1;
  transition: background .12s, color .12s;
}
.tp-seg.tp-active          { color: #fff; background: rgba(255,255,255,.18); }
.tp-seg:hover:not(.tp-active) { color: rgba(255,255,255,.8); background: rgba(255,255,255,.1); }
.tp-colon {
  font-size: 34px;
  font-weight: 700;
  color: rgba(255,255,255,.6);
  pointer-events: none;
  padding: 0 2px;
}

/* mode sub-label */
.tp-mode-label {
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #6b7280);
  text-transform: uppercase;
  letter-spacing: .5px;
  padding: 8px 0 4px;
}

/* clock */
.tp-clock-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 6px 24px 10px;
}
.tp-clock-face {
  position: relative;
  width: 200px;
  height: 200px;
  flex-shrink: 0;
}

/* SVG overlay — behind number buttons */
.tp-svg {
  position: absolute;
  inset: 0;
  width: 200px;
  height: 200px;
  pointer-events: none;
  overflow: visible;
}
.tp-dial {
  fill: var(--bg, #f4f6ff);
  stroke: var(--border, #e5e7eb);
  stroke-width: 1.5;
}
.tp-hand-line {
  stroke: var(--blue, #5B7BF0);
  stroke-width: 2;
  stroke-linecap: round;
  opacity: .85;
}
.tp-center-dot { fill: var(--blue, #5B7BF0); }

/* number buttons */
.tp-num {
  position: absolute;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--text, #1a1a2e);
  transform: translate(-50%, -50%);
  z-index: 1;
  transition: background .1s, color .1s;
  line-height: 1;
  padding: 0;
}
.tp-num:hover                 { background: var(--blue-light, #eef1fe); color: var(--blue, #5B7BF0); }
.tp-num.tp-selected           { background: var(--blue, #5B7BF0) !important; color: #fff !important; }
.tp-num-inner                 { font-size: 11px; color: var(--text-muted, #6b7280); }
.tp-num-inner:hover           { color: var(--blue, #5B7BF0); }
.tp-num-inner.tp-selected     { color: #fff !important; }

/* footer */
.tp-footer {
  display: flex;
  justify-content: flex-end;
  padding: 8px 12px 12px;
  border-top: 1px solid var(--border, #e5e7eb);
}
.tp-cancel-btn {
  background: none;
  border: 1.5px solid var(--border, #e5e7eb);
  color: var(--text-muted, #6b7280);
  font-size: 13px;
  font-weight: 600;
  padding: 7px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: background .15s;
  font-family: inherit;
}
.tp-cancel-btn:hover { background: #f3f4f6; }

/* trigger input styling */
.tp-input {
  cursor: pointer !important;
  caret-color: transparent;
}
.tp-input:focus { outline: none; }
  `;
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Popup creation (singleton)
// ─────────────────────────────────────────────────────────────────────────────
function ensurePopup() {
  if (_popup) return _popup;
  injectStyles();

  _popup = document.createElement('div');
  _popup.id        = 'tp-popup';
  _popup.className = 'tp-popup';
  _popup.setAttribute('role', 'dialog');
  _popup.setAttribute('aria-label', 'Time picker');

  _popup.innerHTML = `
    <div class="tp-digital">
      <button type="button" class="tp-seg tp-seg-h tp-active" id="tp-seg-h">00</button>
      <span class="tp-colon">:</span>
      <button type="button" class="tp-seg tp-seg-m" id="tp-seg-m">00</button>
    </div>
    <div class="tp-mode-label" id="tp-mode-label">Select Hour</div>
    <div class="tp-clock-wrap">
      <div class="tp-clock-face" id="tp-clock-face">
        <svg class="tp-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <circle class="tp-dial"       cx="100" cy="100" r="90"/>
          <line   class="tp-hand-line"  id="tp-hand-line" x1="100" y1="100" x2="100" y2="21"/>
          <circle class="tp-center-dot" cx="100" cy="100" r="4.5"/>
        </svg>
      </div>
    </div>
    <div class="tp-footer">
      <button type="button" class="tp-cancel-btn" id="tp-cancel-btn">Cancel</button>
    </div>
  `;

  document.body.appendChild(_popup);

  // Wire up static controls
  _popup.querySelector('#tp-seg-h').addEventListener('click', () => switchMode('h'));
  _popup.querySelector('#tp-seg-m').addEventListener('click', () => switchMode('m'));
  _popup.querySelector('#tp-cancel-btn').addEventListener('click', closePicker);

  // Stop mousedown from bubbling to the document outside-click handler
  _popup.addEventListener('mousedown', e => e.stopPropagation());

  return _popup;
}

// ─────────────────────────────────────────────────────────────────────────────
// Open / close
// ─────────────────────────────────────────────────────────────────────────────
function openPicker(inputEl) {
  ensurePopup();
  _input = inputEl;

  // Parse current value to pre-select hours/minutes
  const val      = inputEl.value.trim();
  const origType = inputEl.dataset.tpOrigType || 'time';
  let timeStr    = '';

  if (origType === 'datetime-local' && val.includes('T')) {
    timeStr = val.split('T')[1]?.slice(0, 5) || '';
  } else if (/^\d{1,2}:\d{2}/.test(val)) {
    timeStr = val.slice(0, 5);
  }

  const parts = timeStr ? timeStr.split(':') : ['0', '0'];
  _h = Math.min(23, Math.max(0, parseInt(parts[0], 10) || 0));
  _m = Math.min(59, Math.max(0, parseInt(parts[1], 10) || 0));
  _m = Math.round(_m / 5) * 5 % 60;   // snap to nearest 5-minute mark

  switchMode('h');
  positionPopup(inputEl);
  _popup.classList.add('tp-open');
}

function closePicker() {
  _popup?.classList.remove('tp-open');
  _input = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Positioning — open below, flip above if no room
// ─────────────────────────────────────────────────────────────────────────────
function positionPopup(el) {
  const rect  = el.getBoundingClientRect();
  const sY    = window.scrollY || window.pageYOffset;
  const sX    = window.scrollX || window.pageXOffset;
  const pw    = 248;
  const ph    = 350;   // estimated popup height

  let top  = rect.bottom + sY + 6;
  let left = rect.left  + sX;

  // Clamp to right edge
  const maxLeft = window.innerWidth + sX - pw - 8;
  if (left > maxLeft) left = maxLeft;
  if (left < sX + 8) left = sX + 8;

  // Flip above if not enough room below
  if (rect.bottom + ph + 6 > window.innerHeight) {
    const topAbove = rect.top + sY - ph - 6;
    if (topAbove > sY) top = topAbove;
  }

  _popup.style.top  = `${top}px`;
  _popup.style.left = `${left}px`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode — 'h' (hour) or 'm' (minute)
// ─────────────────────────────────────────────────────────────────────────────
function switchMode(mode) {
  _mode = mode;

  const segH = document.getElementById('tp-seg-h');
  const segM = document.getElementById('tp-seg-m');
  const lbl  = document.getElementById('tp-mode-label');
  const face = document.getElementById('tp-clock-face');

  segH.classList.toggle('tp-active', mode === 'h');
  segM.classList.toggle('tp-active', mode === 'm');
  lbl.textContent = mode === 'h' ? 'Select Hour' : 'Select Minute';

  // Rebuild clock numbers for the new mode
  face.querySelectorAll('.tp-num').forEach(n => n.remove());

  if (mode === 'h') {
    HOURS_OUTER.forEach((v, i) => addNum(face, v, i * 30, OUTER_R, false));
    HOURS_INNER.forEach((v, i) => addNum(face, v, i * 30, INNER_R, true));
  } else {
    MINS.forEach((v, i) => addNum(face, v, i * 30, OUTER_R, false));
  }

  updateDigital();
  updateHand();
}

// ─────────────────────────────────────────────────────────────────────────────
// Add a number button on the clock face
// ─────────────────────────────────────────────────────────────────────────────
function addNum(face, value, angleDeg, radius, isInner) {
  const rad = angleDeg * Math.PI / 180;
  const x   = CENTER + radius * Math.sin(rad);
  const y   = CENTER - radius * Math.cos(rad);

  const btn = document.createElement('button');
  btn.type  = 'button';
  btn.className = 'tp-num' + (isInner ? ' tp-num-inner' : '');
  btn.textContent = pad(value);
  btn.style.left  = `${x}px`;
  btn.style.top   = `${y}px`;

  if (_mode === 'h' ? value === _h : value === _m) {
    btn.classList.add('tp-selected');
  }

  btn.addEventListener('click', () => {
    if (_mode === 'h') {
      _h = value;
      switchMode('m');   // auto-advance to minute selection
    } else {
      _m = value;
      commitValue();     // done — write value and close
    }
  });

  face.appendChild(btn);
}

// ─────────────────────────────────────────────────────────────────────────────
// Update the digital HH : MM display
// ─────────────────────────────────────────────────────────────────────────────
function updateDigital() {
  const segH = document.getElementById('tp-seg-h');
  const segM = document.getElementById('tp-seg-m');
  if (segH) segH.textContent = pad(_h);
  if (segM) segM.textContent = pad(_m);
}

// ─────────────────────────────────────────────────────────────────────────────
// Update the hand SVG line to point at the current selection
// ─────────────────────────────────────────────────────────────────────────────
function updateHand() {
  const line = document.getElementById('tp-hand-line');
  if (!line) return;

  let angleDeg, radius;

  if (_mode === 'h') {
    const oIdx = HOURS_OUTER.indexOf(_h);
    const iIdx = HOURS_INNER.indexOf(_h);
    if (oIdx !== -1) { angleDeg = oIdx * 30; radius = OUTER_R; }
    else             { angleDeg = (iIdx !== -1 ? iIdx : 0) * 30; radius = INNER_R; }
  } else {
    const nearM = Math.round(_m / 5) * 5 % 60;
    const mIdx  = MINS.indexOf(nearM);
    angleDeg = (mIdx !== -1 ? mIdx : 0) * 30;
    radius   = OUTER_R;
  }

  const rad = angleDeg * Math.PI / 180;
  line.setAttribute('x2', CENTER + radius * Math.sin(rad));
  line.setAttribute('y2', CENTER - radius * Math.cos(rad));
}

// ─────────────────────────────────────────────────────────────────────────────
// Commit the selected time to the input and close
// ─────────────────────────────────────────────────────────────────────────────
function commitValue() {
  if (!_input) return;

  const timeStr  = `${pad(_h)}:${pad(_m)}`;
  const origType = _input.dataset.tpOrigType || 'time';

  if (origType === 'datetime-local') {
    // Preserve the existing date, update only the time portion
    const existing = _input.value;
    const datePart = (existing && existing.includes('T'))
      ? existing.split('T')[0]
      : new Date().toISOString().slice(0, 10);
    _input.value = `${datePart}T${timeStr}`;
  } else {
    _input.value = timeStr;
  }

  // Notify any listeners watching the input
  _input.dispatchEvent(new Event('change', { bubbles: true }));
  _input.dispatchEvent(new Event('input',  { bubbles: true }));

  closePicker();
}

// ─────────────────────────────────────────────────────────────────────────────
// Outside-click: close picker when clicking outside the popup
// (the popup's own mousedown handler calls stopPropagation so this only fires
//  for clicks that land outside the popup)
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('mousedown', () => {
  if (_popup?.classList.contains('tp-open')) closePicker();
});

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attach the time picker to an input element.
 * Supports type="time" and type="datetime-local".
 * Safe to call multiple times on the same element (idempotent).
 */
export function attachTimePicker(inputEl) {
  if (!inputEl || inputEl.dataset.tpAttached) return;
  inputEl.dataset.tpAttached = '1';
  inputEl.dataset.tpOrigType = inputEl.type;   // 'time' or 'datetime-local'

  // Convert to a plain text field so the browser's native picker never opens
  inputEl.setAttribute('type', 'text');
  inputEl.readOnly = true;
  inputEl.classList.add('tp-input');
  if (!inputEl.placeholder) inputEl.placeholder = '––:––';

  inputEl.addEventListener('click', e => {
    e.preventDefault();
    openPicker(inputEl);
  });
}
