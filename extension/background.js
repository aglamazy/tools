// Aglamaz Form Assistant — Service Worker

const API_BASE = 'https://aglamazo.com';

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
    return true;
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

  // Sidebar requests field extraction → forward to content script
  if (message.type === 'EXTRACT_FIELDS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) {
        sendResponse({ fields: [] });
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { type: 'EXTRACT_FIELDS' }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ fields: [] });
          return;
        }
        sendResponse(response || { fields: [] });
      });
    });
    return true;
  }

  // Sidebar requests form fill → forward to content script
  if (message.type === 'FILL_FIELDS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) {
        sendResponse({ results: [] });
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { type: 'FILL_FIELDS', fields: message.fields }, (response) => {
        sendResponse(response || { results: [] });
      });
    });
    return true;
  }

  // Forward FORM_FIELDS_EXTRACTED from content script to sidebar
  if (message.type === 'FORM_FIELDS_EXTRACTED') {
    // Re-broadcast to all extension pages (sidebar will pick it up)
    chrome.runtime.sendMessage(message).catch(() => {});
    sendResponse({ received: true });
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
    const apiKey = await getApiKey();
    if (!apiKey) return;
    const response = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
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
