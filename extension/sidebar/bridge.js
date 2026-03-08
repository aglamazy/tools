const iframe = document.getElementById('sidebar-frame');
const ALLOWED_ORIGINS = ['http://localhost:3100', 'https://tools.aglamaz.com'];

// Bridge: iframe postMessage → background script → content script
window.addEventListener('message', (event) => {
  if (!ALLOWED_ORIGINS.includes(event.origin)) return;
  const msg = event.data;
  if (!msg || !msg.type) return;

  chrome.runtime.sendMessage(msg, (response) => {
    if (msg.type === 'EXTRACT_FIELDS') {
      iframe.contentWindow.postMessage({ type: 'FIELDS_RESULT', fields: response?.fields || [] }, '*');
    }
    if (msg.type === 'FILL_FIELDS') {
      iframe.contentWindow.postMessage({ type: 'FILL_RESULT', results: response?.results || [] }, '*');
    }
  });
});
