// Aglamaz Form Assistant — Service Worker

const API_BASE = 'https://tools.aglamaz.com';
const VERSION_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Listen for messages from sidebar
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_AUTH_TOKEN') {
    chrome.storage.local.get(['authToken', 'refreshToken', 'user'], (result) => {
      sendResponse({
        authToken: result.authToken || null,
        refreshToken: result.refreshToken || null,
        user: result.user || null,
      });
    });
    return true; // keep channel open for async response
  }

  if (message.type === 'SET_AUTH_TOKEN') {
    chrome.storage.local.set({
      authToken: message.authToken,
      refreshToken: message.refreshToken,
      user: message.user,
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'CLEAR_AUTH') {
    chrome.storage.local.remove(['authToken', 'refreshToken', 'user'], () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'CHECK_VERSION') {
    checkForUpdates().then(sendResponse);
    return true;
  }
});

// Periodic version check
async function checkForUpdates() {
  try {
    const manifest = chrome.runtime.getManifest();
    const currentVersion = manifest.version;
    const response = await fetch(`${API_BASE}/api/extension/version`);
    if (!response.ok) return { updateAvailable: false, currentVersion };
    const data = await response.json();
    const latestVersion = data.version;
    return {
      updateAvailable: latestVersion !== currentVersion,
      currentVersion,
      latestVersion,
    };
  } catch {
    return { updateAvailable: false, error: 'Failed to check for updates' };
  }
}

// Token refresh logic
async function refreshAuthToken() {
  const result = await chrome.storage.local.get(['refreshToken']);
  if (!result.refreshToken) return;

  try {
    const response = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${await getApiKey()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${result.refreshToken}`,
      }
    );
    if (!response.ok) return;
    const data = await response.json();
    await chrome.storage.local.set({
      authToken: data.id_token,
      refreshToken: data.refresh_token,
    });
  } catch (e) {
    console.error('[Aglamaz] Token refresh failed:', e);
  }
}

async function getApiKey() {
  const result = await chrome.storage.local.get(['firebaseApiKey']);
  return result.firebaseApiKey || '';
}

// Set up periodic version check
chrome.alarms.create('versionCheck', { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'versionCheck') {
    checkForUpdates();
  }
});

// Check on startup
chrome.runtime.onStartup.addListener(() => {
  checkForUpdates();
  refreshAuthToken();
});

// Also check on install
chrome.runtime.onInstalled.addListener(() => {
  checkForUpdates();
});
