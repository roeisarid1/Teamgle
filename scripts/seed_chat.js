const admin = require("firebase-admin");
const serviceAccount = require("../backend/Teamgle.Api/secrets/firebase-service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: "teamgle-9b1c5",
});
const db = admin.firestore();

// Participants and their UIDs
const users = {
  roee:   { uid: "O0002w49z1aCDKtSi2lMj2pLFbI3", name: "Roee Sarid" },
  alex:   { uid: "VqsGKX1jP2dwZzBf5lLYpdUnbzE2", name: "Alex Morgan" },
  jonatas:{ uid: "Xk5rhO4Ks5XNtG2lZBZzabBBkel1", name: "jonatas bennon" },
  segev:  { uid: "Ei2bhQohfrbxxppH1nQY8cG3FZS2", name: "Segev Levinstien" },
  niv:    { uid: "W2Ua7ZwLWuMHGRak11UssqgeQnm1", name: "Niv Alexx" },
  kgkg:   { uid: "uR3I7rifN7XWBS1dyfaw36iuCoT2", name: "כגכג כגכגכגכ" },
};

// Find the conversation with "noc operator" in title and 20:00-02:00
async function findConversation() {
  const snap = await db.collection("conversations")
    .where("scope.type", "==", "shift")
    .get();

  let found = null;
  snap.forEach(doc => {
    const d = doc.data();
    const title = d.scope?.title || d.title || "";
    if (title.includes("noc operator") && (title.includes("20:00") || title.includes("22:00"))) {
      found = { id: doc.id, data: d };
    }
  });

  // Fallback: search all conversations for noc operator
  if (!found) {
    const snap2 = await db.collection("conversations").get();
    snap2.forEach(doc => {
      const d = doc.data();
      const title = d.scope?.title || d.title || d.scope?.subtitle || "";
      const sub   = d.scope?.subtitle || "";
      if ((title + sub).toLowerCase().includes("noc operator")) {
        found = { id: doc.id, data: d };
      }
    });
  }
  return found;
}

function ts(minutesAgo) {
  return admin.firestore.Timestamp.fromDate(
    new Date(Date.now() - minutesAgo * 60 * 1000)
  );
}

const messages = [
  { user: "roee",    text: "היי כולם, מישהו יכול לאשר שהוא מגיע למשמרת הלילה?", minsAgo: 180 },
  { user: "jonatas", text: "אני מגיע! מה צריך להביא?", minsAgo: 175 },
  { user: "segev",   text: "גם אני. יש חניה באתר?", minsAgo: 170 },
  { user: "niv",     text: "אני בדרך, כ-15 דקות השהייה", minsAgo: 160 },
  { user: "alex",    text: "שלום כולם, תדאגו לבוא עם תעודת זהות לכניסה", minsAgo: 155 },
  { user: "kgkg",    text: "מה הכתובת המדויקת?", minsAgo: 150 },
  { user: "roee",    text: "הכתובת: רחוב הברזל 30 תל אביב, כניסה דרך שער ב'", minsAgo: 145 },
  { user: "jonatas", text: "תודה! נתראה שם", minsAgo: 140 },
  { user: "segev",   text: "מה לגבי ארוחה? יש קפיטריה?", minsAgo: 120 },
  { user: "alex",    text: "יש חדר אוכל בקומה 2, פתוח עד חצות", minsAgo: 115 },
  { user: "niv",     text: "מעולה, תודה על המידע", minsAgo: 110 },
  { user: "roee",    text: "אל תשכחו לחתום נוכחות בכניסה ובסיום", minsAgo: 90 },
  { user: "kgkg",    text: "מובן, מה הלבוש הנדרש?", minsAgo: 85 },
  { user: "alex",    text: "לבוש חכם, לא בהכרח חליפה. לוגו החברה יועדף", minsAgo: 80 },
  { user: "jonatas", text: "👍 הבנתי", minsAgo: 78 },
  { user: "segev",   text: "אוקי, מתכונן. נתראה הלילה כולם!", minsAgo: 60 },
  { user: "niv",     text: "נתראה! 💪", minsAgo: 55 },
  { user: "roee",    text: "בהצלחה לכולם, משמרת מצוינת!", minsAgo: 30 },
  { user: "kgkg",    text: "יש עדכון לגבי שינוי בשעות?", minsAgo: 20 },
  { user: "alex",    text: "לא, הכל כמתוכנן. 20:00 חדה", minsAgo: 18 },
  { user: "jonatas", text: "אני כבר במקום, כולם יודעים לאן ללכת?", minsAgo: 10 },
  { user: "segev",   text: "כן, בדרך", minsAgo: 8 },
  { user: "niv",     text: "5 דקות ממני", minsAgo: 5 },
  { user: "roee",    text: "מעולה, הגעה בשעה 2 כולם לאשר", minsAgo: 2 },
];

async function main() {
  const conv = await findConversation();
  if (!conv) {
    console.error("❌ Conversation not found. Available convs:");
    const all = await db.collection("conversations").get();
    all.forEach(d => {
      const data = d.data();
      console.log(" -", d.id, "|", data.scope?.title || data.title || "(no title)");
    });
    process.exit(1);
  }

  console.log("✅ Found conversation:", conv.id);
  console.log("   Title:", conv.data.scope?.title || conv.data.title);

  const messagesRef = db.collection("conversations").doc(conv.id).collection("messages");
  // Delete existing messages first
  const existingMsgs = await messagesRef.get();
  for (const d of existingMsgs.docs) await d.ref.delete();
  console.log(`🗑  Deleted ${existingMsgs.size} old messages`);

  const batch = db.batch();

  for (const msg of messages) {
    const u = users[msg.user];
    const ref = messagesRef.doc();
    batch.set(ref, {
      senderId:   u.uid,
      senderName: u.name,
      content:    msg.text,
      timestamp:  ts(msg.minsAgo),
      type:       "text",
    });
  }

  await batch.commit();

  // Update lastMessage on conversation
  const lastMsg  = messages[messages.length - 1];
  const lastUser = users[lastMsg.user];
  await db.collection("conversations").doc(conv.id).update({
    lastMessage:         lastMsg.text,
    lastMessageAt:       ts(lastMsg.minsAgo),
    lastMessageSenderId: lastUser.uid,
  });

  console.log(`✅ Added ${messages.length} messages to conversation ${conv.id}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
