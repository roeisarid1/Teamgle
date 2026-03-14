// chat-ui.js
// ── Chat UI rendering and event handling ─────────────────────────────────────
// This module builds and manages the full chat interface.
// It delegates all data operations to chat-service.js.

import {
  writeUserProfile,
  getCompanyUsers,
  getOrCreateConversation,
  subscribeToConversations,
  subscribeToMessages,
  sendMessage,
  markConversationRead,
  unsubscribeAll
} from "./chat-service.js";

// ── Module state ──────────────────────────────────────────────────────────────
let _user              = null;   // { uid, firstName, lastName, email, companyId, role }
let _conversations     = [];     // cached conversation list
let _activeConvId      = null;   // currently open conversation ID
let _companyUsers      = [];     // all users in same company
let _container         = null;   // root DOM element for the chat

// ── Icons (inline SVG to avoid Lucide re-render issues) ────────────────────
const ICON_SEND = `<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
const ICON_BACK = `<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>`;
const ICON_CHAT = `<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize the chat UI inside the given container element.
 * @param {HTMLElement} container
 * @param {{ firstName, lastName, email, companyId, role, userId }} profile
 * @param {string} firebaseUid
 */
export function initChat(container, profile, firebaseUid) {
  _container = container;
  _user = {
    uid:       firebaseUid,
    firstName: profile.firstName,
    lastName:  profile.lastName,
    email:     profile.email || "",
    companyId: profile.companyId,
    role:      profile.role,
    displayName: `${profile.firstName} ${profile.lastName}`.trim()
  };

  _container.innerHTML = buildChatHTML();
  _bindEvents();
  _loadConversations();
}

/**
 * Tear down all listeners and clear state. Call when navigating away from chat.
 */
export function destroyChat() {
  unsubscribeAll();
  _activeConvId  = null;
  _conversations = [];
  _companyUsers  = [];
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

function buildChatHTML() {
  return `
    <div class="chat-container">

      <!-- LEFT PANEL: conversation list -->
      <aside class="chat-sidebar" id="chat-sidebar">
        <div class="chat-sidebar-header">
          <h2>Messages</h2>
          <button class="btn-new-chat" id="btn-new-chat">＋ New Chat</button>
        </div>
        <div class="chat-search-wrap">
          <input
            type="search"
            class="chat-search-input"
            id="chat-search"
            placeholder="Search conversations…"
            autocomplete="off"
          />
        </div>
        <div class="conversation-list" id="conversation-list">
          <div class="chat-loading">
            <div class="chat-spinner"></div>
            Loading…
          </div>
        </div>
      </aside>

      <!-- RIGHT PANEL: active conversation -->
      <div class="chat-main" id="chat-main">
        <div class="chat-no-selection" id="chat-no-selection">
          <div class="chat-no-selection-icon">${ICON_CHAT}</div>
          <h3>Your Messages</h3>
          <p>Select a conversation from the list, or start a new one.</p>
          <button class="btn-start-chat" id="btn-start-chat-main">＋ New Conversation</button>
        </div>
        <div class="chat-active-view" id="chat-active-view" style="display:none">
          <!-- Header -->
          <div class="chat-header" id="chat-header">
            <button class="btn-chat-back" id="btn-chat-back" title="Back to conversations">
              ${ICON_BACK}
            </button>
            <div class="chat-header-avatar" id="chat-header-avatar"></div>
            <div class="chat-header-info">
              <div class="chat-header-name" id="chat-header-name"></div>
              <div class="chat-header-role" id="chat-header-role"></div>
            </div>
          </div>
          <!-- Messages -->
          <div class="chat-messages" id="chat-messages">
            <div class="msgs-loading">
              <div class="chat-spinner"></div>
              Loading messages…
            </div>
          </div>
          <!-- Input -->
          <div class="chat-input-area">
            <div class="chat-textarea-wrap">
              <textarea
                class="chat-textarea"
                id="chat-textarea"
                placeholder="Type a message…"
                rows="1"
                maxlength="2000"
              ></textarea>
            </div>
            <button class="btn-send" id="btn-send" title="Send message" disabled>
              ${ICON_SEND}
            </button>
          </div>
        </div>
      </div>

    </div>

    <!-- USER PICKER OVERLAY -->
    <div class="user-picker-overlay" id="user-picker-overlay" role="dialog" aria-modal="true">
      <div class="user-picker-modal">
        <div class="user-picker-header">
          <h3>New Conversation</h3>
          <button class="btn-picker-close" id="btn-picker-close" aria-label="Close">×</button>
        </div>
        <div class="user-picker-search-wrap">
          <input
            type="search"
            class="user-picker-search"
            id="picker-search"
            placeholder="Search people…"
            autocomplete="off"
          />
        </div>
        <div class="user-picker-list" id="picker-list">
          <div class="chat-loading">
            <div class="chat-spinner"></div>
            Loading…
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT BINDING
// ─────────────────────────────────────────────────────────────────────────────

function _bindEvents() {
  // New chat buttons
  _q("#btn-new-chat").addEventListener("click", _openUserPicker);
  _q("#btn-start-chat-main").addEventListener("click", _openUserPicker);

  // User picker close
  _q("#btn-picker-close").addEventListener("click", _closeUserPicker);
  _q("#user-picker-overlay").addEventListener("click", e => {
    if (e.target === _q("#user-picker-overlay")) _closeUserPicker();
  });

  // Picker search
  _q("#picker-search").addEventListener("input", _filterPickerList);

  // Conversation search
  _q("#chat-search").addEventListener("input", _filterConversations);

  // Send message
  _q("#btn-send").addEventListener("click", _sendMessage);

  // Textarea: auto-resize + Enter to send
  const textarea = _q("#chat-textarea");
  textarea.addEventListener("input", () => {
    _autoResize(textarea);
    _q("#btn-send").disabled = !textarea.value.trim();
  });
  textarea.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      _sendMessage();
    }
  });

  // Mobile back button
  _q("#btn-chat-back").addEventListener("click", _showMobileSidebar);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATIONS
// ─────────────────────────────────────────────────────────────────────────────

function _loadConversations() {
  subscribeToConversations(_user.companyId, _user.uid, convs => {
    _conversations = convs;
    _renderConversationList(convs);
  });
}

function _renderConversationList(convs) {
  const list = _q("#conversation-list");
  const searchVal = (_q("#chat-search")?.value ?? "").trim().toLowerCase();
  const filtered = searchVal
    ? convs.filter(c => _getOtherParticipantInfo(c).name.toLowerCase().includes(searchVal))
    : convs;

  if (!filtered.length) {
    list.innerHTML = `
      <div class="chat-empty-state">
        <div class="chat-empty-icon">💬</div>
        <p class="chat-empty-title">${searchVal ? "No results" : "No conversations yet"}</p>
        <p class="chat-empty-hint">${searchVal ? "Try a different name." : "Start a chat with a colleague."}</p>
        ${!searchVal ? `<button class="btn-start-chat" id="btn-empty-new">＋ New Conversation</button>` : ""}
      </div>`;
    _q("#btn-empty-new")?.addEventListener("click", _openUserPicker);
    return;
  }

  list.innerHTML = filtered.map(c => _buildConvItem(c)).join("");

  // Bind click on each item
  list.querySelectorAll(".conv-item").forEach(el => {
    el.addEventListener("click", () => {
      const convId = el.dataset.convId;
      _openConversation(convId);
    });
  });
}

function _buildConvItem(conv) {
  const { name, role } = _getOtherParticipantInfo(conv);
  const initials  = _initials(name);
  const unread    = conv.unreadCounts?.[_user.uid] ?? 0;
  const lastMsg   = conv.lastMessage ? _escHtml(conv.lastMessage) : "<em>No messages yet</em>";
  const timeLabel = conv.lastMessageAt ? _formatTime(conv.lastMessageAt) : "";
  const isActive  = conv.id === _activeConvId;
  const isManager = role === "Manager";

  return `
    <div
      class="conv-item ${isActive ? "active" : ""} ${unread > 0 ? "has-unread" : ""}"
      data-conv-id="${conv.id}"
      role="button"
      tabindex="0"
    >
      <div class="conv-avatar ${isManager ? "manager-avatar" : ""}">${initials}</div>
      <div class="conv-info">
        <div class="conv-name">${_escHtml(name)}</div>
        <div class="conv-last-msg">${lastMsg}</div>
      </div>
      <div class="conv-meta">
        ${timeLabel ? `<span class="conv-time">${timeLabel}</span>` : ""}
        ${unread > 0 ? `<span class="conv-badge">${unread > 99 ? "99+" : unread}</span>` : ""}
      </div>
    </div>`;
}

function _filterConversations() {
  _renderConversationList(_conversations);
}

// ─────────────────────────────────────────────────────────────────────────────
// OPEN CONVERSATION
// ─────────────────────────────────────────────────────────────────────────────

function _openConversation(convId) {
  _activeConvId = convId;

  // Update active state in list
  _q("#conversation-list").querySelectorAll(".conv-item").forEach(el => {
    el.classList.toggle("active", el.dataset.convId === convId);
  });

  // Show active view
  _q("#chat-no-selection").style.display = "none";
  _q("#chat-active-view").style.display = "";

  // Mobile: hide sidebar, show main
  _q("#chat-sidebar").classList.add("hidden-mobile");
  _q("#chat-main").classList.add("visible-mobile");

  // Set header
  const conv = _conversations.find(c => c.id === convId);
  if (conv) _setConvHeader(conv);

  // Clear messages + load
  _q("#chat-messages").innerHTML = `
    <div class="msgs-loading">
      <div class="chat-spinner"></div>
      Loading messages…
    </div>`;

  subscribeToMessages(convId, msgs => {
    _renderMessages(msgs);
    // Scroll to bottom
    const el = _q("#chat-messages");
    el.scrollTop = el.scrollHeight;
  });

  // Mark as read
  markConversationRead(convId, _user.uid);

  // Reset textarea
  const ta = _q("#chat-textarea");
  ta.value = "";
  ta.style.height = "";
  _q("#btn-send").disabled = true;
}

function _setConvHeader(conv) {
  const { name, role } = _getOtherParticipantInfo(conv);
  const isManager = role === "Manager";
  _q("#chat-header-avatar").className = `chat-header-avatar ${isManager ? "manager-avatar" : ""}`;
  _q("#chat-header-avatar").textContent = _initials(name);
  _q("#chat-header-name").textContent = name;
  _q("#chat-header-role").textContent = role || "";
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────────────────────────────────────────────

function _renderMessages(msgs) {
  const el = _q("#chat-messages");
  const wasAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;

  if (!msgs.length) {
    el.innerHTML = `
      <div class="msgs-empty">
        <div class="msgs-empty-icon">👋</div>
        <p>No messages yet.<br>Say hello!</p>
      </div>`;
    return;
  }

  let html = "";
  let lastDateLabel = "";
  let lastSenderId  = null;

  msgs.forEach(msg => {
    const dateLabel = _formatDate(msg.timestamp);
    if (dateLabel !== lastDateLabel) {
      html += `
        <div class="msg-date-divider">
          <span class="msg-date-label">${_escHtml(dateLabel)}</span>
        </div>`;
      lastDateLabel = dateLabel;
      lastSenderId  = null; // reset grouping on date change
    }

    const isOwn         = msg.senderId === _user.uid;
    const showAvatar    = !isOwn && lastSenderId !== msg.senderId;
    const showName      = !isOwn && lastSenderId !== msg.senderId;
    const isManager     = _isManagerUid(msg.senderId);
    const timeStr       = msg.timestamp ? _formatMsgTime(msg.timestamp) : "";

    if (!isOwn) {
      html += `
        <div class="msg-row">
          ${showAvatar
            ? `<div class="msg-avatar-sm ${isManager ? "manager-avatar" : ""}">${_initials(msg.senderName)}</div>`
            : `<div class="msg-avatar-placeholder"></div>`
          }
          <div class="msg-content">
            ${showName ? `<div class="msg-sender-name">${_escHtml(msg.senderName)}</div>` : ""}
            <div class="msg-bubble">${_escHtml(msg.content)}</div>
            ${timeStr ? `<div class="msg-time">${timeStr}</div>` : ""}
          </div>
        </div>`;
    } else {
      html += `
        <div class="msg-row own">
          <div class="msg-avatar-placeholder"></div>
          <div class="msg-content">
            <div class="msg-bubble">${_escHtml(msg.content)}</div>
            ${timeStr ? `<div class="msg-time">${timeStr}</div>` : ""}
          </div>
        </div>`;
    }

    lastSenderId = msg.senderId;
  });

  el.innerHTML = html;

  // Auto-scroll if user was near the bottom
  if (wasAtBottom) {
    el.scrollTop = el.scrollHeight;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEND MESSAGE
// ─────────────────────────────────────────────────────────────────────────────

async function _sendMessage() {
  const ta      = _q("#chat-textarea");
  const content = ta.value.trim();
  if (!content || !_activeConvId) return;

  const btn = _q("#btn-send");
  btn.disabled = true;

  try {
    await sendMessage(
      _activeConvId,
      _user.uid,
      _user.displayName,
      content
    );
    ta.value = "";
    ta.style.height = "";
    // Mark as read for the sender
    markConversationRead(_activeConvId, _user.uid);
  } catch (err) {
    console.error("Send failed:", err);
    btn.disabled = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// USER PICKER
// ─────────────────────────────────────────────────────────────────────────────

async function _openUserPicker() {
  _q("#user-picker-overlay").classList.add("open");
  _q("#picker-search").value = "";
  _q("#picker-list").innerHTML = `
    <div class="chat-loading">
      <div class="chat-spinner"></div>
      Loading…
    </div>`;

  try {
    _companyUsers = await getCompanyUsers(_user.companyId, _user.uid);
    _renderPickerList(_companyUsers);
  } catch (err) {
    console.error("Failed to load company users:", err);
    _q("#picker-list").innerHTML = `<div class="user-picker-empty">Failed to load users. Please try again.</div>`;
  }

  // Focus search input
  setTimeout(() => _q("#picker-search").focus(), 80);
}

function _closeUserPicker() {
  _q("#user-picker-overlay").classList.remove("open");
}

function _filterPickerList() {
  const q = _q("#picker-search").value.trim().toLowerCase();
  const filtered = q
    ? _companyUsers.filter(u => u.displayName.toLowerCase().includes(q)
        || u.email.toLowerCase().includes(q))
    : _companyUsers;
  _renderPickerList(filtered);
}

function _renderPickerList(users) {
  const list = _q("#picker-list");

  if (!users.length) {
    list.innerHTML = `<div class="user-picker-empty">No people found.</div>`;
    return;
  }

  list.innerHTML = users.map(u => {
    const isManager = u.role === "Manager";
    return `
      <div class="user-picker-item" data-uid="${u.uid}" role="button" tabindex="0">
        <div class="picker-avatar ${isManager ? "manager-avatar" : ""}">${_initials(u.displayName)}</div>
        <div>
          <div class="picker-name">${_escHtml(u.displayName)}</div>
          <div class="picker-role">
            <span class="picker-role-badge ${isManager ? "manager" : ""}">${u.role}</span>
          </div>
        </div>
      </div>`;
  }).join("");

  list.querySelectorAll(".user-picker-item").forEach(el => {
    el.addEventListener("click", () => _startConversationWith(el.dataset.uid));
    el.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") _startConversationWith(el.dataset.uid);
    });
  });
}

async function _startConversationWith(otherUid) {
  const other = _companyUsers.find(u => u.uid === otherUid);
  if (!other) return;

  _closeUserPicker();

  const participantInfo = {
    [_user.uid]: {
      name:  _user.displayName,
      email: _user.email,
      role:  _user.role
    },
    [other.uid]: {
      name:  other.displayName,
      email: other.email,
      role:  other.role
    }
  };

  try {
    const convId = await getOrCreateConversation(
      _user.uid,
      other.uid,
      _user.companyId,
      participantInfo
    );

    // If conversation is already in the list, open it directly
    const existing = _conversations.find(c => c.id === convId);
    if (existing) {
      _openConversation(convId);
    } else {
      // It will appear shortly via the subscribeToConversations listener.
      // Open it optimistically.
      _activeConvId = convId;
      _q("#chat-no-selection").style.display = "none";
      _q("#chat-active-view").style.display = "";
      _q("#chat-sidebar").classList.add("hidden-mobile");
      _q("#chat-main").classList.add("visible-mobile");

      // Set header from the local user info we already have
      const headerAvatar = _q("#chat-header-avatar");
      const isManager = other.role === "Manager";
      headerAvatar.className = `chat-header-avatar ${isManager ? "manager-avatar" : ""}`;
      headerAvatar.textContent = _initials(other.displayName);
      _q("#chat-header-name").textContent = other.displayName;
      _q("#chat-header-role").textContent = other.role;

      // Load messages
      subscribeToMessages(convId, msgs => {
        _renderMessages(msgs);
        const msgEl = _q("#chat-messages");
        msgEl.scrollTop = msgEl.scrollHeight;
      });

      _q("#chat-messages").innerHTML = `
        <div class="msgs-empty">
          <div class="msgs-empty-icon">👋</div>
          <p>No messages yet.<br>Say hello!</p>
        </div>`;

      const ta = _q("#chat-textarea");
      ta.value = "";
      ta.style.height = "";
      _q("#btn-send").disabled = true;
    }
  } catch (err) {
    console.error("Failed to create conversation:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE
// ─────────────────────────────────────────────────────────────────────────────

function _showMobileSidebar() {
  _q("#chat-sidebar").classList.remove("hidden-mobile");
  _q("#chat-main").classList.remove("visible-mobile");
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function _q(selector) {
  return _container.querySelector(selector);
}

function _escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function _getOtherParticipantInfo(conv) {
  const otherUid = conv.participants.find(uid => uid !== _user.uid);
  const info = conv.participantInfo?.[otherUid];
  return {
    name: info?.name ?? "Unknown",
    role: info?.role ?? ""
  };
}

function _isManagerUid(uid) {
  // Check from participantInfo of the active conversation
  const conv = _conversations.find(c => c.id === _activeConvId);
  return conv?.participantInfo?.[uid]?.role === "Manager";
}

function _formatTime(timestamp) {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now  = new Date();
  const diff = now - date;

  if (diff < 60 * 1000) return "now";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`;

  const sameDay =
    date.getDate()     === now.getDate() &&
    date.getMonth()    === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const sameYesterday =
    date.getDate()     === yesterday.getDate() &&
    date.getMonth()    === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (sameYesterday) return "Yesterday";

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function _formatDate(timestamp) {
  if (!timestamp) return "Unknown date";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now  = new Date();

  const sameDay =
    date.getDate()     === now.getDate() &&
    date.getMonth()    === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (sameDay) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const sameYesterday =
    date.getDate()     === yesterday.getDate() &&
    date.getMonth()    === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();
  if (sameYesterday) return "Yesterday";

  return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

function _formatMsgTime(timestamp) {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function _autoResize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
}
