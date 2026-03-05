// Aglamaz Form Assistant — Service Worker
// The sidebar is an iframe to the web app, so this is minimal.

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});
