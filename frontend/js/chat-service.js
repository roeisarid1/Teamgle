// chat-service.js
// ── Firebase Firestore data layer for the chat system ────────────────────────
// This module is UI-agnostic: it only reads/writes Firestore data.
// It can be extended to support event chat and shift chat in the future.

import { db } from "./firebase-config.js";
import {
  collection, doc, setDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, onSnapshot, serverTimestamp, increment, writeBatch,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Active listener references (for cleanup) ──────────────────────────────────
let _conversationsUnsub = null;
let _messagesUnsub      = null;

// ─────────────────────────────────────────────────────────────────────────────
// USER PROFILES
// Written to Firestore on login so users are discoverable for chat.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert this user's profile into Firestore so other company members can find them.
 * @param {string} uid - Firebase UID
 * @param {{ firstName, lastName, email, companyId, role }} info
 */
export async function writeUserProfile(uid, { firstName, lastName, email, companyId, role }) {
  await setDoc(doc(db, "userProfiles", uid), {
    uid,
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`.trim(),
    email,
    companyId,
    role,
    lastSeen: serverTimestamp()
  }, { merge: true });
}

/**
 * Fetch all users in the same company (excluding the current user).
 * @param {string} companyId
 * @param {string} currentUid - excluded from results
 * @returns {Promise<Array>}
 */
export async function getCompanyUsers(companyId, currentUid) {
  const q = query(
    collection(db, "userProfiles"),
    where("companyId", "==", companyId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => d.data())
    .filter(u => u.uid !== currentUid);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATIONS
// Each conversation has: companyId, type, participants[], participantInfo,
// lastMessage, lastMessageAt, unreadCounts.
// The `type` field ("general" | "event" | "shift") enables future expansion.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find an existing general conversation between two users, or create a new one.
 * Returns the conversation ID.
 * @param {string} currentUid
 * @param {string} otherUid
 * @param {string} companyId
 * @param {Object} participantInfo - map of uid → { name, email, role }
 * @returns {Promise<string>} conversationId
 */
export async function getOrCreateConversation(currentUid, otherUid, companyId, participantInfo) {
  // Build a deterministic document ID from the two sorted UIDs.
  // This guarantees that concurrent calls from both sides always target the
  // same Firestore document, eliminating any race-condition duplicate risk.
  // Firebase UIDs are alphanumeric-only, so "_x_" is a safe separator.
  const [uidA, uidB] = [currentUid, otherUid].sort();
  const convDocId = `conv_general_${uidA}_x_${uidB}`;
  const convRef   = doc(db, "conversations", convDocId);

  // Atomic transaction: read → create only if not yet existing.
  // If two callers race, one transaction commits and the other retries and
  // finds the document already present, so it skips creation.
  await runTransaction(db, async tx => {
    const snap = await tx.get(convRef);
    if (!snap.exists()) {
      tx.set(convRef, {
        companyId,
        type: "general",            // "event" | "shift" for future chat types
        participants: [currentUid, otherUid],
        participantInfo,            // snapshot of names/roles for display
        lastMessage: null,
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: null,
        createdAt: serverTimestamp(),
        unreadCounts: {
          [currentUid]: 0,
          [otherUid]: 0
        }
      });
    }
  });

  return convDocId;
}

/**
 * Find or create a scoped group conversation for an event or shift.
 * @param {"event"|"shift"} type
 * @param {string} scopeId - eventId or shiftId
 * @param {string} companyId
 * @param {string[]} participants
 * @param {Object} participantInfo - map of uid -> { name, email, role }
 * @param {{ title: string, subtitle?: string, eventId?: string, shiftId?: string }} scope
 * @returns {Promise<string>} conversationId
 */
export async function getOrCreateScopedConversation(
  type,
  scopeId,
  companyId,
  participants,
  participantInfo,
  scope,
) {
  if (type !== "event" && type !== "shift") {
    throw new Error("Unsupported conversation type.");
  }
  const uniqueParticipants = [...new Set(participants.filter(Boolean))].sort();
  if (uniqueParticipants.length === 0) {
    throw new Error("Conversation must include at least one participant.");
  }

  const safeScopeId = String(scopeId).replaceAll("/", "_");
  const convDocId = `conv_${type}_${safeScopeId}`;
  const convRef = doc(db, "conversations", convDocId);

  await runTransaction(db, async tx => {
    const snap = await tx.get(convRef);
    if (!snap.exists()) {
      const unreadCounts = {};
      uniqueParticipants.forEach(uid => { unreadCounts[uid] = 0; });

      tx.set(convRef, {
        companyId,
        type,
        scope: {
          ...scope,
          id: scopeId,
          title: scope?.title || (type === "event" ? "Event Chat" : "Shift Chat")
        },
        participants: uniqueParticipants,
        participantInfo,
        lastMessage: null,
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: null,
        createdAt: serverTimestamp(),
        unreadCounts
      });
      return;
    }

    const existing = snap.data();
    const mergedParticipants = [
      ...new Set([...(existing.participants ?? []), ...uniqueParticipants])
    ].sort();
    const mergedInfo = { ...(existing.participantInfo ?? {}), ...participantInfo };
    const mergedUnread = { ...(existing.unreadCounts ?? {}) };
    mergedParticipants.forEach(uid => {
      if (mergedUnread[uid] == null) mergedUnread[uid] = 0;
    });

    tx.update(convRef, {
      companyId,
      type,
      scope: {
        ...(existing.scope ?? {}),
        ...scope,
        id: scopeId,
        title: scope?.title || existing.scope?.title || (type === "event" ? "Event Chat" : "Shift Chat")
      },
      participants: mergedParticipants,
      participantInfo: mergedInfo,
      unreadCounts: mergedUnread
    });
  });

  return convDocId;
}

/**
 * Add participants to an existing scoped event/shift conversation.
 * Unlike getOrCreateScopedConversation, this does not create a new chat.
 * @returns {Promise<boolean>} true when an existing conversation was updated.
 */
export async function addParticipantsToScopedConversation(
  type,
  scopeId,
  companyId,
  participants,
  participantInfo,
  scope,
) {
  if (type !== "event" && type !== "shift") {
    throw new Error("Unsupported conversation type.");
  }

  const uniqueParticipants = [...new Set(participants.filter(Boolean))].sort();
  if (uniqueParticipants.length === 0) return false;

  const safeScopeId = String(scopeId).replaceAll("/", "_");
  const convDocId = `conv_${type}_${safeScopeId}`;
  const convRef = doc(db, "conversations", convDocId);
  let updated = false;

  await runTransaction(db, async tx => {
    const snap = await tx.get(convRef);
    if (!snap.exists()) return;

    const existing = snap.data();
    const mergedParticipants = [
      ...new Set([...(existing.participants ?? []), ...uniqueParticipants])
    ].sort();
    const mergedInfo = { ...(existing.participantInfo ?? {}), ...participantInfo };
    const mergedUnread = { ...(existing.unreadCounts ?? {}) };
    mergedParticipants.forEach(uid => {
      if (mergedUnread[uid] == null) mergedUnread[uid] = 0;
    });

    tx.update(convRef, {
      companyId,
      type,
      scope: {
        ...(existing.scope ?? {}),
        ...scope,
        id: scopeId,
        title: scope?.title || existing.scope?.title || (type === "event" ? "Event Chat" : "Shift Chat")
      },
      participants: mergedParticipants,
      participantInfo: mergedInfo,
      unreadCounts: mergedUnread
    });
    updated = true;
  });

  return updated;
}

/**
 * Subscribe to all conversations for a user in a company.
 * Conversations are sorted by most recent activity (client-side).
 * Calls callback(conversations[]) on every change.
 * @param {string} companyId
 * @param {string} uid
 * @param {function} callback
 * @returns {function} unsubscribe function
 */
export function subscribeToConversations(companyId, uid, callback) {
  // Unsubscribe from any previous listener
  if (_conversationsUnsub) {
    _conversationsUnsub();
    _conversationsUnsub = null;
  }

  // Single-field array-contains query — no composite index required.
  // Company isolation is enforced client-side (safe: user can only be in their own convs).
  const q = query(
    collection(db, "conversations"),
    where("participants", "array-contains", uid)
  );

  _conversationsUnsub = onSnapshot(q, snap => {
    const convs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => c.companyId === companyId)  // company isolation guard
      .sort((a, b) => {
        const aT = a.lastMessageAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
        const bT = b.lastMessageAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
        return bT - aT;
      });
    callback(convs);
  });

  return _conversationsUnsub;
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGES
// Stored as a subcollection: conversations/{id}/messages/{id}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subscribe to all messages in a conversation, ordered by timestamp ascending.
 * Calls callback(messages[]) on every change.
 * @param {string} conversationId
 * @param {function} callback
 * @returns {function} unsubscribe function
 */
export function subscribeToMessages(conversationId, callback) {
  // Unsubscribe from any previous message listener
  if (_messagesUnsub) {
    _messagesUnsub();
    _messagesUnsub = null;
  }

  const q = query(
    collection(db, "conversations", conversationId, "messages"),
    orderBy("timestamp", "asc")
  );

  _messagesUnsub = onSnapshot(q, snap => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(msgs);
  });

  return _messagesUnsub;
}

/**
 * Send a text message and update conversation metadata atomically.
 * @param {string} conversationId
 * @param {string} senderId - Firebase UID
 * @param {string} senderName
 * @param {string} content
 */
export async function sendMessage(conversationId, senderId, senderName, content) {
  const trimmed = content.trim();
  if (!trimmed) return;

  // Load conversation to get participants list for unread increment
  const convRef  = doc(db, "conversations", conversationId);
  const convSnap = await getDoc(convRef);
  if (!convSnap.exists()) throw new Error("Conversation not found.");

  const participants = convSnap.data().participants;

  // Build unread increments for every participant except the sender
  const unreadUpdates = {};
  participants.forEach(uid => {
    if (uid !== senderId) {
      unreadUpdates[`unreadCounts.${uid}`] = increment(1);
    }
  });

  // Atomic batch: add message + update conversation metadata
  const batch  = writeBatch(db);
  const msgRef = doc(collection(db, "conversations", conversationId, "messages"));

  batch.set(msgRef, {
    senderId,
    senderName,
    content: trimmed,
    timestamp: serverTimestamp(),
    type: "text"                 // "image" | "file" in future
  });

  batch.update(convRef, {
    lastMessage: trimmed,
    lastMessageAt: serverTimestamp(),
    lastMessageSenderId: senderId,
    ...unreadUpdates
  });

  await batch.commit();
}

/**
 * Reset the unread count for a user in a conversation (called when they open it).
 * @param {string} conversationId
 * @param {string} uid
 */
export async function markConversationRead(conversationId, uid) {
  try {
    await updateDoc(doc(db, "conversations", conversationId), {
      [`unreadCounts.${uid}`]: 0
    });
  } catch {
    // Non-critical — silently ignore
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLEANUP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unsubscribe all active Firestore listeners. Call when leaving the chat section.
 */
export function unsubscribeAll() {
  if (_conversationsUnsub) { _conversationsUnsub(); _conversationsUnsub = null; }
  if (_messagesUnsub)      { _messagesUnsub();      _messagesUnsub = null;      }
}
