# 6 - Chrome Extension Skeleton

## Config overrides
- start_branch: dev
- pr_target: dev
- create_pr: false (keep on feature branch until mature)

## Problem

The Form Filler (Task 7) needs a Chrome extension with a sidebar to assist users filling external forms. This task builds the foundation: an installable extension with sidebar shell, Firebase auth, backend communication, self-update mechanism, and a download page on tools.aglamaz.com.

No form-filling logic — just the working skeleton.

## Fix

### 1. Extension project structure

Create extension source under `extension/` at the project root:

```
extension/
  manifest.json
  background.js          # service worker
  sidebar/
    index.html           # sidebar shell
    sidebar.js           # sidebar logic
    sidebar.css
  icons/
    icon16.png
    icon48.png
    icon128.png
  popup/
    popup.html           # minimal popup with "open sidebar" prompt
    popup.js
```

### 2. Manifest (Manifest V3)

```json
{
  "manifest_version": 3,
  "name": "Aglamaz Form Assistant",
  "version": "1.0.0",
  "description": "עוזר למילוי טפסים — Aglamaz",
  "permissions": ["sidePanel", "activeTab", "storage"],
  "side_panel": {
    "default_path": "sidebar/index.html"
  },
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "update_url": "https://tools.aglamaz.com/api/extension/updates.xml",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### 3. Service worker (`background.js`)

- Opens side panel when the extension icon is clicked
- Handles auth token storage (Chrome `storage.local`)
- Listens for messages from sidebar (message passing)
- Periodic version check against the server (fallback alongside Chrome's built-in `update_url` polling)

### 4. Sidebar shell

**sidebar/index.html + sidebar.js:**

- RTL Hebrew layout
- **Login state**: if no auth token, show Firebase login (email/password or Google OAuth)
- **Logged-in state**: show user info, placeholder content area (for Task 7), logout button
- **Status bar**: connection indicator, extension version
- Communicates with background service worker via `chrome.runtime.sendMessage`
- Calls backend API routes with auth token in headers

### 5. Firebase Auth in the extension

- Use Firebase Auth REST API (extensions can't use the full Firebase JS SDK easily)
- Or use Firebase Auth with `chrome.identity` for Google OAuth
- Store auth token in `chrome.storage.local`
- Token refresh logic in the service worker
- Backend API routes validate the Firebase ID token server-side

### 6. Self-update mechanism

**Server-side (Next.js):**

- `/app/api/extension/updates.xml/route.ts` — serves Chrome update manifest XML:
  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
    <app appid="{extension-id}">
      <updatecheck crid="{extension-id}" version="1.0.0"
        url="https://tools.aglamaz.com/api/extension/download" />
    </app>
  </gupdate>
  ```
- `/app/api/extension/version/route.ts` — returns current version JSON (for manual checks)
- `/app/api/extension/download/route.ts` — serves the latest `.crx` or `.zip` file

**Extension-side:**
- Chrome handles automatic update checks via `update_url` in manifest
- Additionally, the service worker checks `/api/extension/version` on startup and periodically
- If a newer version is detected, show a badge/notification in the sidebar prompting the user to update

**Extension build artifact:**
- Store the packaged extension file (`.crx` or `.zip`) in `public/extension/` or serve from Firebase Storage
- Include a build script in `extension/` to package the extension (`npm run build:extension` or a simple zip script)

### 7. Download & install page

New page at `/app/extension/page.tsx` (route: `/extension`):

- Aglamaz branding
- "התקן תוסף" (Install Extension) heading
- Download button — downloads the extension `.crx` or `.zip`
- Step-by-step install instructions with screenshots:
  1. Download the file
  2. Open `chrome://extensions`
  3. Enable Developer Mode
  4. Drag the file / "Load unpacked"
- Current version display
- Link to extension source/docs if needed

### 8. Backend API auth middleware

Add a utility to validate Firebase ID tokens on API routes, so the extension can securely call backend endpoints:

- Verify token via Firebase Admin SDK
- Extract user ID and email
- Reject unauthorized requests

This middleware will be used by Task 7's form-filler API routes as well.

## Files

| File | What changes |
|------|-------------|
| `extension/manifest.json` | **New** — Manifest V3 config with sidePanel, update_url |
| `extension/background.js` | **New** — service worker: side panel, auth, message passing, version check |
| `extension/sidebar/index.html` | **New** — sidebar HTML shell (RTL) |
| `extension/sidebar/sidebar.js` | **New** — sidebar logic: auth flow, API calls, UI state |
| `extension/sidebar/sidebar.css` | **New** — sidebar styles |
| `extension/popup/popup.html` | **New** — minimal popup |
| `extension/popup/popup.js` | **New** — popup logic |
| `extension/icons/` | **New** — extension icons (16, 48, 128px) |
| `extension/build.sh` | **New** — script to package extension as .zip |
| `app/extension/page.tsx` | **New** — download & install instructions page |
| `app/api/extension/updates.xml/route.ts` | **New** — Chrome update manifest XML endpoint |
| `app/api/extension/version/route.ts` | **New** — version check JSON endpoint |
| `app/api/extension/download/route.ts` | **New** — serves packaged extension file |
| `app/lib/firebaseAdmin.ts` | **New** — Firebase Admin SDK init + token verification utility |

## Verify

- [ ] Run `npx tsc --noEmit` — no type errors
- [ ] Run `npx eslint app` — no lint errors
- [ ] Run `extension/build.sh` — produces a `.zip` file without errors
- [ ] Start dev server on port 3100
- [ ] Navigate to `http://localhost:3100/extension` — download page renders with instructions and download button
- [ ] Download the extension file — file downloads successfully
- [ ] Load the extension in Chrome (`chrome://extensions` → Developer Mode → Load unpacked → select `extension/` folder)
- [ ] **Expect**: extension icon appears in Chrome toolbar
- [ ] Click extension icon → sidebar opens
- [ ] **Expect**: sidebar shows login screen (RTL Hebrew)
- [ ] Log in via the sidebar → Firebase auth succeeds
- [ ] **Expect**: sidebar shows logged-in state with user info and placeholder content
- [ ] Call `http://localhost:3100/api/extension/version` → returns version JSON
- [ ] Call `http://localhost:3100/api/extension/updates.xml` → returns valid XML update manifest
- [ ] **Expect**: no console errors in extension background page or sidebar
- [ ] Take screenshot of sidebar in logged-in state
