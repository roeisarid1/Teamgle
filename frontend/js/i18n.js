const LANGUAGE_KEY = "teamgle-language";

const HE_BY_EN = {
  "Name": "שם",
  "Role": "תפקיד",
  "Company": "חברה",
  "Loading…": "טוען…",
  "Sign Out": "התנתק",
  "Menu": "תפריט",
  "Events": "אירועים",
  "Employees": "עובדים",
  "Customers": "לקוחות",
  "Calendar": "לוח שנה",
  "Payment Requests": "דרישות תשלום",
  "Chats": "הודעות",
  "My Shifts": "המשמרות שלי",
  "All your shifts, offers, and briefings in one place": "כל המשמרות, ההצעות והתדריכים שלך במקום אחד",
  "Offered": "הצעות",
  "Upcoming": "קרובות",
  "History": "היסטוריה",
  "Add Employee": "הוסף עובד",
  "Status": "סטטוס",
  "All": "הכל",
  "Active": "פעיל",
  "Inactive": "לא פעיל",
  "Clear filters": "נקה סינון",
  "Email": "אימייל",
  "Phone": "טלפון",
  "Cost / hr": "עלות לשעה",
  "Roles": "תפקידים",
  "Actions": "פעולות",
  "Add Customer": "הוסף לקוח",
  "Company Name": "שם חברה",
  "Contact": "איש קשר",
  "New Payment Request": "דרישת תשלום חדשה",
  "Total Requested": "סה\"כ דרישות",
  "Paid": "שולם",
  "Outstanding": "נותר לתשלום",
  "Overdue": "באיחור",
  "All statuses": "כל הסטטוסים",
  "Draft": "טיוטה",
  "Sent": "נשלח",
  "Partially Paid": "שולם חלקית",
  "Cancelled": "בוטל",
  "Request #": "מספר דרישה",
  "Customer": "לקוח",
  "Event": "אירוע",
  "Request Date": "תאריך דרישה",
  "Due Date": "תאריך יעד",
  "Amount": "סכום",
  "Balance": "יתרה",
  "Create Event": "צור אירוע",
  "Today's Events": "אירועים היום",
  "Upcoming Events": "אירועים קרובים",
  "Completed Events": "אירועים שהסתיימו",
  "Back": "חזרה",
  "Edit": "ערוך",
  "Delete": "מחק",
  "Chat": "צ'אט",
  "Staffing": "שיבוץ עובדים",
  "Workers": "עובדים",
  "Gantt": "גאנט",
  "Tasks": "משימות",
  "Briefs": "תדריכים",
  "Expenses": "הוצאות",
  "Hours & Payroll": "שעות ושכר",
  "Finance": "כספים",
  "Open": "פתוח",
  "In Progress": "בתהליך",
  "Done": "בוצע",
  "Canceled": "בוטל",
  "Priority": "עדיפות",
  "urgent": "דחוף",
  "high": "גבוה",
  "medium": "בינוני",
  "low": "נמוך",
  "+ Add Task": "+ הוסף משימה",
  "+ Add Brief": "+ הוסף תדריך",
  "+ Add Expense": "+ הוסף הוצאה",
  "New Conversation": "שיחה חדשה",
  "Messages": "הודעות",
  "New Chat": "שיחה חדשה",
  "Your Messages": "ההודעות שלך",
  "No conversations yet": "אין שיחות עדיין",
  "No results": "אין תוצאות",
  "No messages yet": "אין הודעות עדיין",
  "Type a message…": "הקלד הודעה…",
  "Search conversations…": "חיפוש שיחות…",
  "Search people…": "חיפוש אנשים…",
  "Open sidebar": "פתח סרגל צד",
  "Close": "סגור",
  "Cancel": "ביטול",
  "Save": "שמור",
  "Save Changes": "שמור שינויים",
  "Save Employee": "שמור עובד",
  "Save Customer": "שמור לקוח",
  "Save Contact": "שמור איש קשר",
  "Save Payment": "שמור תשלום",
  "Record Payment": "רישום תשלום",
  "Edit Event": "ערוך אירוע",
  "Delete Event": "מחק אירוע",
};

function normalizeLanguage(lang) {
  return lang === "he" ? "he" : "en";
}

export function getCurrentLanguage() {
  return normalizeLanguage(localStorage.getItem(LANGUAGE_KEY) || "en");
}

export function _t(en, he) {
  return getCurrentLanguage() === "he" ? he : en;
}

export function t(en) {
  if (getCurrentLanguage() !== "he") return en;
  return HE_BY_EN[en] ?? en;
}

export function setLanguage(lang) {
  const next = normalizeLanguage(lang);
  localStorage.setItem(LANGUAGE_KEY, next);
  applyLanguageDirection(next);
  applyTranslations();
  window.dispatchEvent(new CustomEvent("teamgle:languagechange", { detail: { lang: next } }));
}

export function applyLanguageDirection(lang = getCurrentLanguage()) {
  const normalized = normalizeLanguage(lang);
  document.documentElement.lang = normalized;
  document.documentElement.dir = normalized === "he" ? "rtl" : "ltr";
  document.body?.classList.toggle("rtl", normalized === "he");
}

export function applyTranslations(root = document) {
  const lang = getCurrentLanguage();
  applyLanguageDirection(lang);
  updateLanguageButtons(root, lang);

  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const en = el.dataset.i18nEn ?? el.textContent.trim();
    el.dataset.i18nEn = en;
    el.textContent = lang === "he" ? (HE_BY_EN[en] ?? en) : en;
  });

  translateAttribute(root, "placeholder");
  translateAttribute(root, "title");
  translateAttribute(root, "aria-label");
  translateTextElements(root);
}

export function initI18n() {
  applyTranslations();
  document.querySelectorAll("[data-language-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setLanguage(getCurrentLanguage() === "he" ? "en" : "he");
    });
  });
}

function translateAttribute(root, attr) {
  root.querySelectorAll(`[${attr}]`).forEach((el) => {
    const value = el.getAttribute(attr);
    if (!value) return;
    const dataKey = `i18n${attr.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())}En`;
    const en = el.dataset[dataKey] ?? value;
    el.dataset[dataKey] = en;
    el.setAttribute(attr, getCurrentLanguage() === "he" ? (HE_BY_EN[en] ?? en) : en);
  });
}

function translateTextElements(root) {
  const walker = document.createTreeWalker(root.body ?? root, NodeFilter.SHOW_TEXT);
  const lang = getCurrentLanguage();
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach((node) => {
    const parent = node.parentElement;
    if (!parent || parent.closest("script, style, svg")) return;
    const original = parent.dataset.i18nTextEn ?? node.nodeValue.trim();
    if (!original || !HE_BY_EN[original]) return;
    parent.dataset.i18nTextEn = original;
    node.nodeValue = node.nodeValue.replace(
      node.nodeValue.trim(),
      lang === "he" ? HE_BY_EN[original] : original,
    );
  });
}

function updateLanguageButtons(root, lang) {
  root.querySelectorAll("[data-language-toggle]").forEach((btn) => {
    btn.textContent = lang === "he" ? "English" : "עברית";
    btn.setAttribute("title", lang === "he" ? "Switch to English" : "החלף לעברית");
  });
}
