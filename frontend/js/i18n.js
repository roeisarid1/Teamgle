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
  "👥 Employees": "👥 עובדים",
  "🏢 Customers": "🏢 לקוחות",
  "Search by name…": "חיפוש לפי שם…",
  "Search by company name…": "חיפוש לפי שם חברה…",
  "Search by request #, customer, event…": "חיפוש לפי מספר דרישה, לקוח או אירוע…",
  "Search events…": "חיפוש אירועים…",
  "Search workers…": "חיפוש עובדים…",
  "City": "עיר",
  "Business #": "מספר עסק",
  "Added": "נוסף",
  "Select \"Customers\" to load.": "בחר \"לקוחות\" כדי לטעון.",
  "Select \"Payment Requests\" to load.": "בחר \"דרישות תשלום\" כדי לטעון.",
  "Date": "תאריך",
  "From": "מ",
  "To": "עד",
  "Clear": "נקה",
  "Apply": "החל",
  "Planning": "תכנון",
  "Create New Event": "צור אירוע חדש",
  "Event details and staffing structure": "פרטי אירוע ומבנה שיבוץ",
  "Event Details": "פרטי אירוע",
  "Event Name": "שם האירוע",
  "Start": "התחלה",
  "End": "סיום",
  "Location": "מיקום",
  "Event Type": "סוג אירוע",
  "Attendees Count": "מספר משתתפים",
  "Planned Budget": "תקציב מתוכנן",
  "Expected Revenue": "הכנסה צפויה",
  "Customer & Event": "לקוח ואירוע",
  "Payment Request Details": "פרטי דרישת תשלום",
  "Notes": "הערות",
  "Payment Details": "פרטי תשלום",
  "Paid Amount (₪)": "סכום ששולם (₪)",
  "Payment Date": "תאריך תשלום",
  "Status (auto-calculated if blank)": "סטטוס (יחושב אוטומטית אם ריק)",
  "First Name": "שם פרטי",
  "Last Name": "שם משפחה",
  "Job Title": "תפקיד",
  "Primary contact": "איש קשר ראשי",
  "Additional notes…": "הערות נוספות…",
  "Role & Staffing": "תפקיד ושיבוץ",
  "Required Staff Count": "כמות עובדים נדרשת",
  "Time Window": "חלון זמן",
  "Start Time": "שעת התחלה",
  "End Time": "שעת סיום",
  "Role": "תפקיד",
  "Project": "פרויקט",
  "Stored Status": "סטטוס שמור",
  "Start Date": "תאריך התחלה",
  "End Date": "תאריך סיום",
  "Display status is calculated from dates on the dashboard.": "סטטוס התצוגה מחושב לפי התאריכים בלוח.",
  "Update role, timing, or required staff count": "עדכון תפקיד, זמנים או כמות עובדים נדרשת",
  "Set role, time window, and required staff count": "הגדרת תפקיד, חלון זמן וכמות עובדים נדרשת",
  "Fill in the payment request details below": "מלא את פרטי דרישת התשלום",
  "Update payment details for this request": "עדכן פרטי תשלום לדרישה זו",
  "Adjust event timing, classification, and financial planning": "עדכון זמני האירוע, סיווג ותכנון כספי",
  "Confirm Delete": "אישור מחיקה",
  "Optional notes…": "הערות אופציונליות…",
  "e.g. Jane": "לדוגמה: דנה",
  "e.g. Doe": "לדוגמה: כהן",
  "e.g. Procurement Manager": "לדוגמה: מנהלת רכש",
  "Role name…": "שם תפקיד…",
  "Annual Gala 2025": "גאלה שנתית 2025",
  "Venue name or address": "שם מקום או כתובת",
  "— Select type —": "— בחר סוג —",
  "Conference": "כנס",
  "Party": "מסיבה",
  "Wedding": "חתונה",
  "Corporate": "ארגוני",
  "Bar Mitzvah": "בר מצווה",
  "Birthday": "יום הולדת",
  "Concert": "קונצרט",
  "Exhibition": "תערוכה",
  "Seminar": "סמינר",
  "Gala": "גאלה",
  "Trip": "טיול",
  "Other": "אחר",
  "Cost per Hour": "עלות לשעה",
  "Documents": "מסמכים",
  "Document Title": "כותרת מסמך",
  "Upload Document": "העלאת מסמך",
  "Profile Photo": "תמונת פרופיל",
  "Company Details": "פרטי חברה",
  "Contact Details": "פרטי איש קשר",
  "Contact Persons": "אנשי קשר",
  "Address": "כתובת",
  "Website": "אתר",
  "Tax Number": "מספר עוסק",
  "Customer Details": "פרטי לקוח",
  "Company Phone": "טלפון חברה",
  "Company Email": "אימייל חברה",
  "Company Address": "כתובת חברה",
  "Zip Code": "מיקוד",
  "Country": "מדינה",
  "Business Number": "מספר עסק",
  "Customer Notes": "הערות לקוח",
  "Title": "כותרת",
  "Content": "תוכן",
  "Task description…": "תיאור משימה…",
  "Brief title…": "כותרת תדריך…",
  "Brief content…": "תוכן התדריך…",
  "Employee": "עובד",
  "Budget": "תקציב",
  "Revenue": "הכנסה",
  "Labor": "עבודה",
  "Total Cost": "עלות כוללת",
  "P/L": "רווח/הפסד",
  "Worker Info": "פרטי עובד",
  "Applied Shift": "משמרת",
  "Applied Role": "תפקיד",
  "Cost": "עלות",
  "Eligible Shifts": "משמרות מתאימות",
  "Regular": "רגילות",
  "Overtime": "נוספות",
  "Extras": "תוספות",
  "Total": "סה\"כ",
  "Category": "קטגוריה",
  "Description": "תיאור",
  "Vendor": "ספק",
  "Expense Date": "תאריך הוצאה",
  "Event name": "שם האירוע",
  "Project name": "שם הפרויקט",
  "Expected": "צפוי",
  "Select at least one shift before sending.": "יש לבחור לפחות משמרת אחת לפני שליחה.",
  "Select type": "בחר סוג",
  "Shifts": "משמרות",
  "Add Shift": "הוסף משמרת",
  "+ Add Shift": "+ הוסף משמרת",
  "— Select role —": "— בחר תפקיד —",
  "Select role": "בחר תפקיד",
  "Qty": "כמות",
  "* Qty": "* כמות",
  "* Role": "* תפקיד",
  "* Start": "* התחלה",
  "* End": "* סיום",
  "No shifts defined for this event": "לא הוגדרו משמרות לאירוע הזה",
  "No briefs yet. Start by adding your first brief.": "אין תדריכים עדיין. התחל בהוספת התדריך הראשון.",
  "No expenses recorded yet.": "לא נרשמו הוצאות עדיין.",
  "No approved workers for payroll.": "אין עובדים מאושרים לשכר.",
  "No finance-ready records yet. Hours must be approved and payment status set to Approved or Paid.": "אין עדיין נתונים מוכנים לכספים. יש לאשר שעות ולהגדיר סטטוס תשלום כמאושר או שולם.",
  "No payment requests yet for this event.": "אין עדיין דרישות תשלום לאירוע הזה.",
  "No payment requests yet for this item.": "אין עדיין דרישות תשלום לפריט הזה.",
  "Return to Pool": "החזר למאגר",
  "Move to Potential": "העבר לעובדים פוטנציאליים",
  "Email Address": "כתובת אימייל",
  "Phone Number": "מספר טלפון",
  "Cost per Hour (₪)": "עלות לשעה (₪)",
  "(select at least one)": "(בחר לפחות אחד)",
  "Assign roles": "שיוך תפקידים",
  "FILES": "קבצים",
  "Profile Image": "תמונת פרופיל",
  "Click to upload profile image": "לחץ להעלאת תמונת פרופיל",
  "JPG, PNG, WEBP · max 5 MB": "JPG, PNG, WEBP · עד 5MB",
  "No documents added": "לא נוספו מסמכים",
  "Add contracts, certifications or any relevant files for this employee.": "הוסף חוזים, אישורים או קבצים רלוונטיים לעובד הזה.",
  "Add contracts, certificates or any relevant files for this employee.": "הוסף חוזים, אישורים או קבצים רלוונטיים לעובד הזה.",
  "Assign roles to define this employee's responsibilities.": "שייך תפקידים כדי להגדיר את תחומי האחריות של העובד.",
  "Remove shift": "הסר משמרת",
  "Start (date & time)": "התחלה (תאריך ושעה)",
  "End (date & time)": "סיום (תאריך ושעה)",
  "+ Add First Document": "+ הוסף מסמך ראשון",
  "Add First Document +": "+ הוסף מסמך ראשון",
  "Upload file": "העלה קובץ",
  "Choose file": "בחר קובץ",
  "No file chosen": "לא נבחר קובץ",
  "Profile": "פרופיל",
  "Image": "תמונה",
  "Approved": "מאושר",
  "Approved or Paid": "מאושר או שולם",
  "Payment Status": "סטטוס תשלום",
  "Save Payroll": "שמור שכר",
  "Payroll": "שכר",
  "Approve Hours": "אשר שעות",
  "Hours": "שעות",
  "No workers with selected shifts to send.": "אין עובדים עם משמרות נבחרות לשליחה.",
  "All available workers have been offered shifts.": "כל העובדים הזמינים קיבלו הצעות למשמרות.",
  "Send shift requests": "שלח בקשות משמרת",
  "worker(s)": "עובדים",
  "shift(s)": "משמרות",
  "Manage worker assignments for this event's shifts.": "נהל שיבוץ עובדים למשמרות האירוע.",
  "Manage worker assignments for this project's shifts and events.": "נהל שיבוץ עובדים למשמרות ולאירועים.",
  "Loading shifts…": "טוען משמרות…",
  "Role fit": "התאמת תפקיד",
  "Commitment": "מחויבות",
  "Attendance": "נוכחות",
  "Assigned": "שובץ",
  "Standby": "המתנה",
  "No eligible applicants were scored for this shift.": "לא נמצאו מועמדים מתאימים לדירוג למשמרת הזו.",
};

const EN_BY_HE = Object.fromEntries(Object.entries(HE_BY_EN).map(([en, he]) => [he, en]));
let isApplyingTranslations = false;
let observerStarted = false;
let pendingApply = null;

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
  if (isApplyingTranslations) return;
  isApplyingTranslations = true;
  try {
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
  } finally {
    isApplyingTranslations = false;
  }
}

export function initI18n() {
  applyTranslations();
  document.querySelectorAll("[data-language-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setLanguage(getCurrentLanguage() === "he" ? "en" : "he");
    });
  });
  startTranslationObserver();
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
    const current = node.nodeValue.trim();
    if (!current) return;
    const next = lang === "he" ? HE_BY_EN[current] : EN_BY_HE[current];
    if (!next) return;
    node.nodeValue = node.nodeValue.replace(current, next);
  });
}

function updateLanguageButtons(root, lang) {
  root.querySelectorAll("[data-language-toggle]").forEach((btn) => {
    btn.textContent = lang === "he" ? "English" : "עברית";
    btn.setAttribute("title", lang === "he" ? "Switch to English" : "החלף לעברית");
  });
}

function startTranslationObserver() {
  if (observerStarted || !document.body) return;
  observerStarted = true;
  const observer = new MutationObserver(() => {
    if (isApplyingTranslations) return;
    clearTimeout(pendingApply);
    pendingApply = setTimeout(() => applyTranslations(), 30);
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}
