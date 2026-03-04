# 7 - Form Filler Foundation + Demo

## Config overrides
- start_branch: dev
- pr_target: dev
- create_pr: false (keep on feature branch until mature)

## Problem

Art freelancers fill long, repetitive application forms for auditions and competitions. The same biographical facts (name, instrument, education, prizes) are re-entered every time. We need the Chrome extension sidebar (Task 6) to:

1. Read form fields from the active page
2. Match them against the user's ProfileQA store (Task 4)
3. Use Claude API to fill gaps and generate appropriate answers
4. Let the user review and save new facts before filling the form

This task builds the foundation and includes a demo form for testing.

## Fix

### 1. Demo form page

Create a test form at `/app/demo-form/page.tsx` (route: `/demo-form`) that mimics a real audition application. The form should include a variety of field types:

- Text inputs: full name (Hebrew), full name (English), instrument, phone, email
- Date input: date of birth
- Textarea: short bio, musical background, why are you applying
- Select dropdown: experience level, preferred language
- File upload: CV/resume, recommendation letter
- Multi-step: split into 2-3 sections with "הבא" (Next) buttons

This form does NOT submit anywhere — it's purely for demo/testing. Style it to look like a plausible institution form.

### 2. Content script for form field extraction

New content script injected into the active tab:

**`extension/content.js`:**
- Scans the DOM for form elements: `<input>`, `<textarea>`, `<select>`, `<label>`
- Extracts structured field data:
  ```javascript
  {
    fields: [
      {
        id: "field-123",           // element id or generated
        type: "text",              // input type
        label: "שם מלא",           // associated label text
        name: "full_name",        // input name attribute
        placeholder: "...",
        value: "",                 // current value
        required: boolean,
        selector: "css-selector"   // for filling later
      }
    ]
  }
  ```
- Sends extracted fields to the sidebar via `chrome.runtime.sendMessage`
- Listens for fill commands: receives `{ selector, value }` pairs and sets field values
- Re-scans when the page changes (MutationObserver) to handle multi-step forms
- Dispatches `input` and `change` events after filling so the form's JS framework registers the values

### 3. Sidebar form-filler UI

Update the sidebar (from Task 6) with the form-filling interface:

**When user navigates to a page with forms:**
1. Content script auto-extracts fields → sends to sidebar
2. Sidebar displays a list of extracted questions with:
   - The label/question text
   - Suggested answer (from ProfileQA match or Claude generation)
   - Edit field for the user to modify the suggestion
   - Status indicator: 🟢 matched from profile / 🟡 AI-generated / 🔴 needs input
3. "מלא טופס" (Fill Form) button — sends all answers to the content script to fill the actual form
4. "שמור עובדות חדשות" (Save New Facts) button — saves any new or corrected answers back to ProfileQA

**Sidebar layout:**
```
┌─────────────────────────┐
│ 📋 עוזר מילוי טפסים     │
│ נמצאו 8 שדות            │
├─────────────────────────┤
│                         │
│ שם מלא            🟢   │
│ [ישראל ישראלי    ] [✏️] │
│                         │
│ כלי נגינה          🟢   │
│ [חליל צד          ] [✏️] │
│                         │
│ למה אתה מגיש?     🟡   │
│ [אני נגן חליל עם  ] [✏️] │
│ [10 שנות ניסיון...]     │
│                         │
│ קורות חיים         🔴   │
│ [לא נמצא - העלה קובץ]  │
│                         │
├─────────────────────────┤
│ [שמור עובדות חדשות]     │
│ [מלא טופס ►         ]   │
└─────────────────────────┘
```

### 4. Answer matching + Claude API

**API route** `/app/api/form-filler/suggest/route.ts`:

- Receives: list of form fields + user's ProfileQA data
- Sends to Claude API with a prompt:
  - "Here are form fields from an application. Here is the user's profile data. Match profile answers to form fields. For fields without a direct match, generate an appropriate answer based on the profile. Return a mapping of field IDs to suggested answers."
- Returns: field-to-answer mapping with confidence/source indicator (profile match vs AI-generated vs no match)

**Matching logic:**
- First pass: fuzzy match field labels against ProfileQA questions (semantic similarity via Claude)
- Second pass: Claude generates answers for unmatched fields using available profile context
- Third pass: flag fields that need user input (file uploads, very specific questions with no profile data)

### 5. ProfileQA save-back flow

When the user reviews answers in the sidebar and clicks "שמור עובדות חדשות":

- Identify answers that are new (no existing ProfileQA match) or modified (user corrected a suggestion)
- For each new/modified answer:
  - Determine answer type from the form field type (text input → word, textarea → paragraph, date → date, file → file)
  - Show in the sidebar as pending saves with the question text
  - User clicks save → calls ProfileQA API to create/update entries
- Claude suggests appropriate tags based on the question context (bio, education, experience, etc.)

### 6. Demo flow (iframe)

Add a "דמו" (Demo) button to the extension sidebar or the Artist business page that:
- Opens the demo form (`/demo-form`) in the active tab
- Extension detects the form fields
- Sidebar populates with suggestions
- User reviews, saves facts, fills the form
- This provides a controlled end-to-end test without needing a real external form

## Files

| File | What changes |
|------|-------------|
| `app/demo-form/page.tsx` | **New** — demo audition application form (multi-step, various field types) |
| `extension/content.js` | **New** — content script: extract form fields, fill values, observe DOM changes |
| `extension/manifest.json` | Add `content_scripts` config for content.js injection |
| `extension/sidebar/sidebar.js` | Add form-filler UI: field list, suggestions, edit, fill, save |
| `extension/sidebar/sidebar.css` | Add styles for form-filler cards and status indicators |
| `extension/sidebar/index.html` | Add form-filler section markup |
| `app/api/form-filler/suggest/route.ts` | **New** — Claude API route: match fields to profile, generate suggestions |
| `app/api/profile-qa/route.ts` | **New** — CRUD API for ProfileQA (extension needs HTTP access, not direct Dexie) |

## Verify

- [ ] Run `npx tsc --noEmit` — no type errors
- [ ] Run `npx eslint app` — no lint errors
- [ ] Start dev server on port 3100
- [ ] Navigate to `http://localhost:3100/demo-form` — multi-step demo form renders correctly
- [ ] Load extension in Chrome, open sidebar
- [ ] Navigate to the demo form in the active tab
- [ ] **Expect**: sidebar shows extracted form fields with labels
- [ ] **Expect**: fields with ProfileQA matches show 🟢 with suggested answers
- [ ] **Expect**: fields without matches show 🔴 or 🟡
- [ ] Edit a suggested answer in the sidebar
- [ ] Click "שמור עובדות חדשות" → new facts saved to ProfileQA
- [ ] Click "מלא טופס" → form fields on the demo page get filled with the answers
- [ ] Click "הבא" (Next) on the demo form → content script re-scans, sidebar updates with new fields
- [ ] **Expect**: no console errors in extension or demo page
- [ ] Take screenshot of sidebar with filled suggestions alongside the demo form
