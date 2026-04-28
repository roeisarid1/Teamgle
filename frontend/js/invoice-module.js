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

function _invStatusBadge(status) {
  return `<span class="inv-badge inv-badge--${status}">${_invStatusLabel[status] || status}</span>`;
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
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Failed to load invoices.</td></tr>`;
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
      const hay = [inv.invoiceNumber, inv.customerCompanyName, inv.projectName, inv.eventName]
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
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No invoices found.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((inv) => {
    const context = [inv.projectName, inv.eventName].filter(Boolean).join(" / ") || "—";
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
        <button class="btn-icon-sm" title="Record Payment" data-inv-pay="${escapeHtml(inv.invoiceId)}"><i data-lucide="banknote"></i></button>
        <button class="btn-icon-sm" title="Edit" data-inv-edit="${escapeHtml(inv.invoiceId)}"><i data-lucide="pencil"></i></button>
        <button class="btn-icon-sm btn-icon-danger" title="Cancel" data-inv-cancel="${escapeHtml(inv.invoiceId)}"><i data-lucide="x-circle"></i></button>
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
  tbody.querySelectorAll("[data-inv-cancel]").forEach((btn) =>
    btn.addEventListener("click", () => _cancelInvoice(btn.dataset.invCancel)));
}

async function _cancelInvoice(invoiceId) {
  if (!confirm("Cancel this invoice? It will be marked as Cancelled.")) return;
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/invoices/${encodeURIComponent(invoiceId)}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 204) throw new Error();
    await loadInvoices();
  } catch { alert("Failed to cancel invoice."); }
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
  document.getElementById("inv-modal-title").textContent   = _editingInvoiceId ? "Edit Invoice"   : "New Invoice";
  document.getElementById("inv-modal-save-label").textContent = _editingInvoiceId ? "Update Invoice" : "Save Invoice";
  const errEl = document.getElementById("inv-modal-error");
  if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

  await _invLoadCustomerDropdown(opts.prefillCustomerId || null);

  const today = new Date().toISOString().slice(0, 10);
  const due30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  if (_editingInvoiceId) {
    const inv = _allInvoices.find((i) => i.invoiceId === _editingInvoiceId);
    if (inv) {
      _setVal("inv-customer", inv.customerId);
      await _invLoadProjectDropdown(inv.customerId, inv.projectId);
      await _invLoadEventDropdown(inv.projectId, inv.eventId);
      _setVal("inv-number",   inv.invoiceNumber);
      _setVal("inv-status",   inv.paymentStatus);
      _setVal("inv-date",     inv.invoiceDate ? inv.invoiceDate.slice(0, 10) : today);
      _setVal("inv-due-date", inv.dueDate     ? inv.dueDate.slice(0, 10)     : due30);
      _setVal("inv-amount",   inv.invoiceAmount);
      _setVal("inv-notes",    inv.notes || "");
    }
  } else {
    _setVal("inv-customer",  opts.prefillCustomerId || "");
    if (opts.prefillCustomerId) await _invLoadProjectDropdown(opts.prefillCustomerId, opts.prefillProjectId || null);
    if (opts.prefillProjectId)  await _invLoadEventDropdown(opts.prefillProjectId, opts.prefillEventId || null);
    _setVal("inv-project",   opts.prefillProjectId  || "");
    _setVal("inv-event",     opts.prefillEventId    || "");
    _setVal("inv-number",    _generateInvoiceNumber());
    _setVal("inv-status",    "draft");
    _setVal("inv-date",      today);
    _setVal("inv-due-date",  due30);
    _setVal("inv-amount",    opts.prefillAmount || "");
    _setVal("inv-notes",     "");
  }

  overlay.style.display = "flex";
  lucide.createIcons();
}

function _generateInvoiceNumber() {
  const y = new Date().getFullYear();
  const n = String(_allInvoices.length + 1).padStart(3, "0");
  return `INV-${y}-${n}`;
}

function _setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? "";
}

async function _invLoadCustomerDropdown(selectedId) {
  const sel = document.getElementById("inv-customer");
  if (!sel) return;
  sel.innerHTML = `<option value="">— select customer —</option>`;
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
  sel.onchange = async () => { await _invLoadProjectDropdown(sel.value, null); _setVal("inv-event", ""); };
  if (selectedId) await _invLoadProjectDropdown(selectedId, null);
}

async function _invLoadProjectDropdown(customerId, selectedProjectId) {
  const sel = document.getElementById("inv-project");
  if (!sel) return;
  sel.innerHTML = `<option value="">— select project —</option>`;
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
  sel.innerHTML = `<option value="">— select event (optional) —</option>`;
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

  if (!customerId)               { _showInvError(errEl, "Please select a customer."); return; }
  if (!number)                   { _showInvError(errEl, "Invoice number is required."); return; }
  if (!date)                     { _showInvError(errEl, "Invoice date is required."); return; }
  if (!dueDate)                  { _showInvError(errEl, "Due date is required."); return; }
  if (isNaN(amount) || amount <= 0) { _showInvError(errEl, "Amount must be greater than 0."); return; }

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
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Update failed."); }
    } else {
      const res = await fetch(`${API_BASE}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ customerId, projectId, eventId, invoiceNumber: number, invoiceDate: date, dueDate, invoiceAmount: amount, paymentStatus: status, notes }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Create failed."); }
    }
    _closeInvoiceModal();
    await loadInvoices();
  } catch (e) {
    _showInvError(errEl, e.message || "An error occurred.");
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
  if (subEl && inv) subEl.textContent = `${inv.invoiceNumber} — ${_fmtMoney(inv.invoiceAmount)} total`;
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

  if (isNaN(paidAmount) || paidAmount < 0) { _showInvError(errEl, "Paid amount must be 0 or greater."); return; }

  saveBtn.disabled = true;
  if (errEl) errEl.style.display = "none";
  try {
    const token = await getToken();
    const res = await fetch(`${API_BASE}/invoices/${encodeURIComponent(_paymentInvoiceId)}/payment`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ paidAmount, paymentDate, paymentStatus: paymentStatus || null }),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Payment save failed."); }
    _closePaymentModal();
    await loadInvoices();
  } catch (e) {
    _showInvError(errEl, e.message || "An error occurred.");
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
      <h4 class="ed-finance-section-title">Invoices</h4>
      <button class="btn-primary btn-sm btn-with-icon" id="${opts.createBtnId || "inv-finance-create-btn"}">
        <i data-lucide="plus"></i> New Invoice
      </button>
    </div>
    ${invoices.length > 0 ? `
      <div class="ed-finance-cards" style="margin-bottom:12px">
        <div class="ed-finance-card"><div class="ed-finance-card-label">Invoiced</div><div class="ed-finance-card-value">${fmt(total)}</div></div>
        <div class="ed-finance-card ed-finance-card--profit"><div class="ed-finance-card-label">Collected</div><div class="ed-finance-card-value">${fmt(paid)}</div></div>
        <div class="ed-finance-card ${outstanding > 0 ? "ed-finance-card--loss" : ""}">
          <div class="ed-finance-card-label">Outstanding</div><div class="ed-finance-card-value">${fmt(outstanding)}</div>
        </div>
      </div>
      <table class="ed-worker-table">
        <thead><tr><th>Invoice #</th><th>Status</th><th>Date</th><th>Due</th><th>Amount</th><th>Paid</th><th>Balance</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>` : `<p class="pd-empty-state" style="padding:12px 0">No invoices yet for this ${opts.context || "item"}.</p>`}
  </div>`;
}
