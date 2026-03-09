const iframe = document.getElementById('sidebar-frame');
iframe.src = SITE_URL + '/extension/sidebar';

const ALLOWED_ORIGINS = new Set(['http://localhost:3100', 'https://aglamazo.com', 'https://tools.aglamaz.com', new URL(SITE_URL).origin]);

// Bridge: iframe postMessage → background script → content script
window.addEventListener('message', (event) => {
  if (!ALLOWED_ORIGINS.has(event.origin)) return;
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
