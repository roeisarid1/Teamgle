import { auth } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ── Backend base URL ───────────────────────────────────────────────────────
// Change this to your deployed backend URL when in production.
const API_BASE = "http://localhost:5000/api/auth";

// ── DOM references ─────────────────────────────────────────────────────────
const tabLogin    = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const formLogin   = document.getElementById("form-login");
const formRegister = document.getElementById("form-register");

const loginEmail    = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginError    = document.getElementById("login-error");
const loginBtn      = document.getElementById("login-btn");

const regEmail    = document.getElementById("reg-email");
const regPassword = document.getElementById("reg-password");
const regConfirm  = document.getElementById("reg-confirm");
const regError    = document.getElementById("reg-error");
const regSuccess  = document.getElementById("reg-success");
const regBtn      = document.getElementById("reg-btn");

const forgotLink    = document.getElementById("forgot-link");
const forgotSection = document.getElementById("forgot-section");
const forgotBack    = document.getElementById("forgot-back");
const forgotEmail   = document.getElementById("forgot-email");
const forgotError   = document.getElementById("forgot-error");
const forgotSuccess = document.getElementById("forgot-success");
const forgotBtn     = document.getElementById("forgot-btn");

// ── Tab switching ──────────────────────────────────────────────────────────
tabLogin.addEventListener("click", () => switchTab("login"));
tabRegister.addEventListener("click", () => switchTab("register"));

function switchTab(tab) {
  if (tab === "login") {
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    formLogin.classList.add("active");
    formRegister.classList.remove("active");
  } else {
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    formRegister.classList.add("active");
    formLogin.classList.remove("active");
  }
  clearMessages();
}

function clearMessages() {
  loginError.textContent  = "";
  loginError.style.display = "none";
  regError.textContent    = "";
  regError.style.display  = "none";
  regSuccess.textContent  = "";
  regSuccess.style.display = "none";
  forgotError.textContent  = "";
  forgotError.style.display = "none";
  forgotSuccess.textContent  = "";
  forgotSuccess.style.display = "none";
}

// ── FORGOT PASSWORD ────────────────────────────────────────────────────────
forgotLink.addEventListener("click", () => {
  formLogin.classList.remove("active");
  forgotSection.classList.add("active");
  forgotSection.setAttribute("aria-hidden", "false");
  forgotEmail.value = loginEmail.value; // pre-fill if already typed
  clearMessages();
});

forgotBack.addEventListener("click", () => {
  forgotSection.classList.remove("active");
  forgotSection.setAttribute("aria-hidden", "true");
  formLogin.classList.add("active");
  forgotEmail.value = "";
  clearMessages();
});

forgotBtn.addEventListener("click", async () => {
  forgotError.style.display   = "none";
  forgotSuccess.style.display = "none";

  const email = forgotEmail.value.trim().toLowerCase();

  if (!email) {
    showError(forgotError, "Please enter your email address.");
    return;
  }

  if (!isValidEmail(email)) {
    showError(forgotError, "Please enter a valid email address.");
    return;
  }

  setLoading(forgotBtn, true);

  try {
    await sendPasswordResetEmail(auth, email);
  } catch (_) {
    // Intentionally swallow — we never reveal whether an email exists.
  } finally {
    setLoading(forgotBtn, false);
  }

  // Always show the same success message (security: prevents user enumeration)
  showSuccess(
    forgotSuccess,
    "If this email is registered, you will receive a password reset link shortly. Check your inbox."
  );
  forgotEmail.value = "";
});

// ── Helpers ────────────────────────────────────────────────────────────────
function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
  btn.textContent = loading ? "Please wait…" : btn.dataset.originalText;
}

function showError(el, message) {
  el.textContent = message;
  el.style.display = "block";
}

function showSuccess(el, message) {
  el.textContent = message;
  el.style.display = "block";
}

// ── LOGIN FLOW ─────────────────────────────────────────────────────────────
loginBtn.addEventListener("click", async () => {
  clearMessages();

  const email    = loginEmail.value.trim().toLowerCase();
  const password = loginPassword.value;

  if (!email || !password) {
    showError(loginError, "Please enter your email and password.");
    return;
  }

  setLoading(loginBtn, true);

  try {
    // Step 1: Sign in with Firebase
    const credential = await signInWithEmailAndPassword(auth, email, password);

    // Step 2: Get Firebase ID token
    const idToken = await credential.user.getIdToken();

    // Step 3: Verify with backend — get user profile + role
    const response = await fetch(`${API_BASE}/verify-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Login verification failed.");
    }

    const profile = await response.json();

    // Step 4: Redirect based on role
    // Store profile in sessionStorage so the next page can use it
    sessionStorage.setItem("userProfile", JSON.stringify(profile));

    if (profile.role === "Manager") {
      window.location.href = "/frontend/manager-dashboard.html";
    } else {
      window.location.href = "/frontend/employee-dashboard.html";
    }

  } catch (err) {
    showError(loginError, friendlyError(err.message));
  } finally {
    setLoading(loginBtn, false);
  }
});

// ── FIRST REGISTRATION FLOW ───────────────────────────────────────────────
regBtn.addEventListener("click", async () => {
  clearMessages();

  const email    = regEmail.value.trim().toLowerCase();
  const password = regPassword.value;
  const confirm  = regConfirm.value;

  // Client-side validation
  if (!email || !password || !confirm) {
    showError(regError, "All fields are required.");
    return;
  }

  if (!isValidEmail(email)) {
    showError(regError, "Please enter a valid email address.");
    return;
  }

  if (password.length < 8) {
    showError(regError, "Password must be at least 8 characters.");
    return;
  }

  if (password !== confirm) {
    showError(regError, "Passwords do not match.");
    return;
  }

  setLoading(regBtn, true);

  try {
    // Step 1: Ask backend whether this email is eligible
    const checkRes = await fetch(`${API_BASE}/check-first-registration`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    if (!checkRes.ok) {
      const data = await checkRes.json();
      throw new Error(data.error || "You are not eligible for registration.");
    }

    // Step 2: Create Firebase account
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUid = credential.user.uid;

    // Step 3: Tell backend to save the Firebase UID in SQL
    const completeRes = await fetch(`${API_BASE}/complete-registration`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, firebaseUid })
    });

    if (!completeRes.ok) {
      // Firebase account was created but backend failed.
      // We delete the Firebase account to avoid orphaned accounts.
      await credential.user.delete();
      const data = await completeRes.json();
      throw new Error(data.error || "Registration could not be completed. Please try again.");
    }

    // Step 4: Done
    showSuccess(regSuccess, "Registration complete! You can now log in.");
    regEmail.value = "";
    regPassword.value = "";
    regConfirm.value = "";

    // Auto-switch to login tab after 2 seconds
    setTimeout(() => switchTab("login"), 2000);

  } catch (err) {
    showError(regError, friendlyError(err.message));
  } finally {
    setLoading(regBtn, false);
  }
});

// ── Utility ────────────────────────────────────────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function friendlyError(message) {
  if (message.includes("auth/user-not-found") || message.includes("auth/wrong-password") || message.includes("auth/invalid-credential"))
    return "Invalid email or password.";
  if (message.includes("auth/email-already-in-use"))
    return "This email is already registered. Please log in instead.";
  if (message.includes("auth/weak-password"))
    return "Password is too weak. Use at least 8 characters.";
  if (message.includes("auth/too-many-requests"))
    return "Too many attempts. Please wait a moment and try again.";
  if (message.includes("auth/network-request-failed"))
    return "Network error. Please check your connection.";
  return message;
}
