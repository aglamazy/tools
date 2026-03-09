// Show version
const manifest = chrome.runtime.getManifest();
document.getElementById('version').textContent = `v${manifest.version}`;

// Open side panel when button is clicked
document.getElementById('open-sidebar').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  }
});
