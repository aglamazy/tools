// Aglamaz Form Assistant — Sidebar Logic

const API_BASE = 'https://tools.aglamaz.com';
// Firebase Auth REST API base
const FIREBASE_AUTH_URL = 'https://identitytoolkit.googleapis.com/v1/accounts';

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const userEmail = document.getElementById('user-email');
const versionDisplay = document.getElementById('version-display');
const connectionStatus = document.getElementById('connection-status');
const updateBanner = document.getElementById('update-banner');

// Show version in status bar
const manifest = chrome.runtime.getManifest();
versionDisplay.textContent = `v${manifest.version}`;

// Initialize — check auth state
async function init() {
  const response = await sendMessage({ type: 'GET_AUTH_TOKEN' });
  if (response && response.authToken && response.user) {
    showLoggedIn(response.user);
  } else {
    showLogin();
  }
  checkVersion();
}

// Message passing to background service worker
function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, resolve);
  });
}

// Show login screen
function showLogin() {
  loginScreen.style.display = 'block';
  mainScreen.style.display = 'none';
}

// Show logged-in screen
function showLoggedIn(user) {
  loginScreen.style.display = 'none';
  mainScreen.style.display = 'block';
  userEmail.textContent = user.email || '';
}

// Login with email/password using Firebase Auth REST API
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.style.display = 'none';
  loginBtn.disabled = true;
  loginBtn.textContent = 'מתחבר...';

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      throw new Error('Firebase API key not configured');
    }

    const response = await fetch(
      `${FIREBASE_AUTH_URL}:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(getFirebaseErrorMessage(data.error?.message));
    }

    // Store auth data
    await sendMessage({
      type: 'SET_AUTH_TOKEN',
      authToken: data.idToken,
      refreshToken: data.refreshToken,
      user: { email: data.email, uid: data.localId },
    });

    // Also store API key for token refresh
    await chrome.storage.local.set({ firebaseApiKey: apiKey });

    showLoggedIn({ email: data.email });
  } catch (err) {
    loginError.textContent = err.message;
    loginError.style.display = 'block';
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'התחבר';
  }
});

// Logout
logoutBtn.addEventListener('click', async () => {
  await sendMessage({ type: 'CLEAR_AUTH' });
  showLogin();
});

// Get Firebase API key from storage or config
async function getApiKey() {
  const result = await chrome.storage.local.get(['firebaseApiKey']);
  return result.firebaseApiKey || '';
}

// Translate Firebase error messages to Hebrew
function getFirebaseErrorMessage(code) {
  const messages = {
    'EMAIL_NOT_FOUND': 'אימייל לא נמצא',
    'INVALID_PASSWORD': 'סיסמה שגויה',
    'USER_DISABLED': 'המשתמש חסום',
    'INVALID_LOGIN_CREDENTIALS': 'אימייל או סיסמה שגויים',
    'TOO_MANY_ATTEMPTS_TRY_LATER': 'יותר מדי ניסיונות. נסה שוב מאוחר יותר',
  };
  return messages[code] || 'שגיאה בהתחברות';
}

// Check for updates
async function checkVersion() {
  const result = await sendMessage({ type: 'CHECK_VERSION' });
  if (result && result.updateAvailable) {
    updateBanner.style.display = 'flex';
  }
}

// Connection status check
async function checkConnection() {
  try {
    const response = await fetch(`${API_BASE}/api/extension/version`);
    connectionStatus.className = response.ok
      ? 'status-dot connected'
      : 'status-dot disconnected';
  } catch {
    connectionStatus.className = 'status-dot disconnected';
  }
}

// Initialize
init();
checkConnection();
