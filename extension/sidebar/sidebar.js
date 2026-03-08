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

// ─── Form Filler Logic ───

const formFillerSection = document.getElementById('form-filler-section');
const noFormSection = document.getElementById('no-form-section');
const fieldsList = document.getElementById('fields-list');
const fieldCount = document.getElementById('field-count');
const fillFormBtn = document.getElementById('fill-form-btn');
const saveFactsBtn = document.getElementById('save-facts-btn');
const formFillerLoading = document.getElementById('form-filler-loading');
const saveFeedback = document.getElementById('save-feedback');
const demoBtn = document.getElementById('demo-btn');

let currentFields = [];
let fieldSuggestions = {};
// Track original suggestions to detect user edits
let originalSuggestions = {};

// Listen for form field messages from content script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'FORM_FIELDS_EXTRACTED') {
    handleFieldsExtracted(message.data);
    sendResponse({ received: true });
  }
  return true;
});

function handleFieldsExtracted(data) {
  if (!data || !data.fields || data.fields.length === 0) {
    formFillerSection.style.display = 'none';
    noFormSection.style.display = 'block';
    return;
  }

  currentFields = data.fields;
  formFillerSection.style.display = 'block';
  noFormSection.style.display = 'none';
  fieldCount.textContent = `נמצאו ${data.fields.length} שדות`;

  // Request suggestions from API
  getSuggestions(data.fields);
}

async function getSuggestions(fields) {
  formFillerLoading.style.display = 'block';
  fillFormBtn.style.display = 'none';
  saveFactsBtn.style.display = 'none';

  try {
    // Get auth token for API call
    const auth = await sendMessage({ type: 'GET_AUTH_TOKEN' });
    const token = auth?.authToken || '';

    const response = await fetch(`${API_BASE}/api/form-filler/suggest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ fields }),
    });

    if (response.ok) {
      const result = await response.json();
      fieldSuggestions = result.suggestions || {};
    } else {
      console.error('[Aglamaz] Suggest API error:', response.status);
      fieldSuggestions = {};
    }
  } catch (err) {
    console.error('[Aglamaz] Suggest API failed:', err);
    fieldSuggestions = {};
  }

  formFillerLoading.style.display = 'none';
  renderFields();
  fillFormBtn.style.display = 'block';
  saveFactsBtn.style.display = 'block';
}

function renderFields() {
  fieldsList.innerHTML = '';
  originalSuggestions = {};

  for (const field of currentFields) {
    const suggestion = fieldSuggestions[field.id] || {};
    const suggestedValue = suggestion.value || '';
    const source = suggestion.source || 'none'; // 'profile', 'ai', 'none'
    const statusEmoji = source === 'profile' ? '🟢' : source === 'ai' ? '🟡' : '🔴';

    originalSuggestions[field.id] = suggestedValue;

    const card = document.createElement('div');
    card.className = 'field-card' + (field.type === 'file' ? ' file-field' : '');
    card.dataset.fieldId = field.id;

    const header = document.createElement('div');
    header.className = 'field-card-header';

    const label = document.createElement('span');
    label.className = 'field-label';
    label.textContent = field.label || field.name || field.id;

    const status = document.createElement('span');
    status.className = 'field-status';
    status.textContent = statusEmoji;

    header.appendChild(label);
    header.appendChild(status);
    card.appendChild(header);

    if (field.type === 'file') {
      const notice = document.createElement('span');
      notice.style.fontSize = '0.75rem';
      notice.style.color = '#991b1b';
      notice.textContent = 'לא נמצא — העלה קובץ';
      card.appendChild(notice);
    } else if (field.type === 'select' && field.options) {
      const select = document.createElement('select');
      select.dataset.fieldId = field.id;
      select.dataset.selector = field.selector;
      for (const opt of field.options) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
        if (opt.value === suggestedValue || opt.text === suggestedValue) {
          option.selected = true;
        }
        select.appendChild(option);
      }
      card.appendChild(select);
    } else if (field.type === 'textarea') {
      const textarea = document.createElement('textarea');
      textarea.dataset.fieldId = field.id;
      textarea.dataset.selector = field.selector;
      textarea.value = suggestedValue;
      textarea.placeholder = field.placeholder || '';
      textarea.rows = 3;
      card.appendChild(textarea);
    } else {
      const input = document.createElement('input');
      input.type = field.type === 'date' ? 'date' : 'text';
      input.dataset.fieldId = field.id;
      input.dataset.selector = field.selector;
      input.value = suggestedValue;
      input.placeholder = field.placeholder || '';
      card.appendChild(input);
    }

    fieldsList.appendChild(card);
  }
}

// Fill Form button
fillFormBtn.addEventListener('click', async () => {
  const fieldsToFill = [];

  for (const card of fieldsList.querySelectorAll('.field-card')) {
    const input = card.querySelector('input, textarea, select');
    if (!input || !input.dataset.selector) continue;
    const value = input.value;
    if (!value) continue;
    fieldsToFill.push({ selector: input.dataset.selector, value });
  }

  if (fieldsToFill.length === 0) return;

  // Send fill command to the active tab's content script
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'FILL_FIELDS',
      fields: fieldsToFill,
    }, (response) => {
      console.log('[Aglamaz] Fill result:', response);
    });
  }
});

// Save New Facts button
saveFactsBtn.addEventListener('click', async () => {
  const newFacts = [];

  for (const card of fieldsList.querySelectorAll('.field-card')) {
    const input = card.querySelector('input, textarea, select');
    if (!input || !input.dataset.fieldId) continue;
    const fieldId = input.dataset.fieldId;
    const currentValue = input.value;
    const originalValue = originalSuggestions[fieldId] || '';
    const field = currentFields.find(f => f.id === fieldId);

    // Save if value is new or was modified by the user
    if (currentValue && currentValue !== originalValue) {
      let answerType = 'word';
      if (field?.type === 'textarea') answerType = 'paragraph';
      else if (field?.type === 'date') answerType = 'date';
      else if (field?.type === 'file') answerType = 'file';

      newFacts.push({
        question: field?.label || field?.name || fieldId,
        answer: currentValue,
        answerType,
      });
    }
  }

  if (newFacts.length === 0) {
    showSaveFeedback('אין עובדות חדשות לשמירה', 'error');
    return;
  }

  try {
    const auth = await sendMessage({ type: 'GET_AUTH_TOKEN' });
    const token = auth?.authToken || '';

    const response = await fetch(`${API_BASE}/api/profile-qa`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ facts: newFacts }),
    });

    if (response.ok) {
      showSaveFeedback(`נשמרו ${newFacts.length} עובדות חדשות`, 'success');
      // Update original suggestions so they're not re-saved
      for (const card of fieldsList.querySelectorAll('.field-card')) {
        const input = card.querySelector('input, textarea, select');
        if (input?.dataset.fieldId) {
          originalSuggestions[input.dataset.fieldId] = input.value;
        }
      }
    } else {
      showSaveFeedback('שגיאה בשמירה', 'error');
    }
  } catch (err) {
    console.error('[Aglamaz] Save facts failed:', err);
    showSaveFeedback('שגיאה בשמירה', 'error');
  }
});

function showSaveFeedback(text, type) {
  saveFeedback.textContent = text;
  saveFeedback.className = 'save-feedback ' + type;
  saveFeedback.style.display = 'block';
  setTimeout(() => { saveFeedback.style.display = 'none'; }, 3000);
}

// Demo button — open demo form in active tab
demoBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.update(tab.id, { url: `${API_BASE}/demo-form` });
  }
});

// Initialize
init();
checkConnection();
