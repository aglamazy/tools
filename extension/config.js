// Auto-detect: unpacked (dev) → localhost, installed from CWS → production
const SITE_URL = chrome.runtime.getManifest().update_url
  ? 'https://aglamazo.com'
  : 'http://localhost:3100';
