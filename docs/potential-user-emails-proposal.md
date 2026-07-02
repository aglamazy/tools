# Proposal: Per-delivery email to potential users

**Task #219 — design proposal for sign-off before implementation.**

---

## Goal

Send a short email to opted-in potential users on every Aglamazo production release.
Includes a one-click unsubscribe link in every email and a self-service toggle in the
user profile. No email is ever sent to someone who hasn't explicitly opted in.

---

## 1. Audience — who gets these emails

Two populations:

| Population | Who | Source |
|---|---|---|
| **Potential users** | People not yet signed up who showed interest | New `emailSubscribers` Firestore collection (see §4) |
| **Existing users (opt-in)** | Signed-up users who want release updates | `marketingEmails: true` flag on `users/{uid}` |

Seed for the first batch: `contactMessages` already in Firestore. Anyone who submitted
the contact form gets a one-time invite to opt in (not auto-subscribed — they click a
"subscribe" link; if they don't, they receive nothing further).

Manually added entries (Agla adds an email via admin panel) are also allowed.

---

## 2. "Delivery" trigger

A **delivery** = a successful Vercel production deployment of the `main` branch.
Vercel supports deploy webhooks — we register a POST endpoint
(`/api/release-email/trigger`) and Vercel calls it after every successful production
deploy.

The endpoint:
1. Reads the release notes payload supplied by Agla (see §6).
2. Fans out to all opted-in subscribers.
3. Is idempotent — deduplicated by `deploymentId` stored in Firestore to prevent
   double-sends on webhook retries.

Alternative trigger (simpler fallback): Agla manually hits a "Send release email" button
in the admin panel. This keeps the happy path simple and removes the Vercel-webhook
dependency for the first iteration.

**Recommendation: start with the manual admin-panel trigger.** Wire the webhook
automatically only after the manual path is proven.

---

## 3. Email provider

**Resend** (`resend.com`).

Reasons:
- First-class Next.js / App Router support; official SDK is `resend` npm package.
- React Email for templates (same stack as the rest of the app).
- Free tier: 3,000 emails/month, 100/day — plenty for a small list.
- Built-in unsubscribe-header support (one-click unsubscribe per RFC 8058).
- Simple, well-documented REST API.
- Dedicated unsubscribe management: Resend tracks unsubscribes and bounces
  and stops re-delivery automatically.

Env var to add: `RESEND_API_KEY` (server-only, sensitive, not `NEXT_PUBLIC_`).

---

## 4. Data model

### 4a. Potential users — `emailSubscribers/{token}` (Firestore)

```
{
  token: string           // UUID v4 — doubles as doc ID and unsubscribe token
  email: string
  name?: string
  optedIn: boolean        // false = hard unsubscribed, never re-add
  subscribedAt: Timestamp
  source: 'contact_form' | 'manual' | 'invite_link'
  lastEmailSentAt?: Timestamp
}
```

Doc keyed on `token` so the unsubscribe URL is `/api/unsubscribe?token=<token>`
with no additional lookup step.

### 4b. Existing users — `users/{uid}` (Firestore, extend existing doc)

Add two fields to the existing user document:

```
marketingEmails: boolean          // default false; opt-in only
marketingUnsubscribeToken: string // UUID v4; generated once on first opt-in
```

---

## 5. Opt-in / opt-out flows

### Opt-in paths
1. **Contact form** — add a checkbox (unchecked by default):
   `☐ שלחו לי עדכוני גרסה וחדשות Aglamazo`
   On submission, if checked: create `emailSubscribers` doc with `optedIn: true`.

2. **Invite link** (one-time, for seeding from existing `contactMessages`):
   `/api/release-email/invite?email=<email>&name=<name>` — renders a landing page
   with a single "כן, אני רוצה לקבל עדכונים" button. Clicking creates the
   subscriber doc.

3. **User profile** — signed-in users get a toggle in their profile settings panel:
   "קבל עדכוני גרסה ומבצעים" — writes `marketingEmails` to `users/{uid}`.

### Opt-out paths (must be honored immediately)

1. **Unsubscribe link in every email** — `https://aglamazo.com/api/unsubscribe?token=<token>`:
   - For `emailSubscribers`: sets `optedIn: false`.
   - For `users`: sets `marketingEmails: false`.
   - Returns a simple confirmation page.
   - One-click (no confirmation form needed — the link itself is the action).

2. **Profile toggle** — signed-in users can flip the same toggle off at any time.

3. **Resend-level unsubscribe** — Resend's List-Unsubscribe header lets email clients
   add a native "Unsubscribe" button. When Resend records an unsubscribe, a Resend
   webhook calls `/api/release-email/resend-webhook` which mirrors the opt-out to Firestore.

All three paths set the same flag; they are equivalent.

---

## 6. Email content

Each release email contains:
- App name + version/date
- 3–5 bullet "what's new" — written by Agla in the admin panel before sending
- One CTA button (optional, e.g. "נסה עכשיו" → aglamazo.com)
- Footer with unsubscribe link and mailing address (legal requirement)

The admin send flow:
1. Agla opens `/admin/release-email` (new admin page).
2. Writes release notes (freeform, 3–5 bullets).
3. Previews the email template.
4. Clicks "שלח לכולם" — triggers the fan-out.

Template: React Email component, Hebrew RTL layout. Reuses existing app color palette.

---

## 7. Privacy / T&C

The existing T&C and privacy policy (Saliko-only today; Aglamazo has none exposed)
don't yet mention marketing emails. Two changes are needed before going live:

1. **Aglamazo privacy notice**: Add a minimal privacy notice (can be one page or a
   section of the existing contact/about page) that mentions: what data is collected,
   that release emails may be sent to opted-in addresses, and how to opt out. This
   does NOT need to match Saliko's full policy — a short notice is enough for a
   small SaaS list.

2. **Contact form disclosure**: The checkbox text ("שלחו לי עדכוני גרסה") already
   functions as explicit consent for that email address. No additional modal needed.

Existing users who opt in via the profile toggle consent at the point of toggle — no
extra gate needed since they already accepted the T&C.

**No email is ever sent without explicit opt-in action.** Existing `contactMessages`
entries do NOT auto-subscribe — they receive the invite-link email at most once.

---

## 8. New files / API routes (implementation scope after sign-off)

| Path | Purpose |
|---|---|
| `app/api/release-email/send/route.ts` | POST — admin-only, triggers fan-out |
| `app/api/release-email/resend-webhook/route.ts` | POST — Resend bounce/unsub webhook |
| `app/api/unsubscribe/route.ts` | GET — one-click unsubscribe handler |
| `app/api/release-email/invite/route.ts` | GET — invite landing for seed list |
| `app/components/admin/ReleaseEmailPanel.tsx` | Admin UI: write notes + send |
| `app/emails/ReleaseEmail.tsx` | React Email template |
| `app/services/emailSubscriberService.ts` | CRUD for `emailSubscribers` collection |
| `app/services/releaseEmailService.ts` | Fan-out logic, dedup by deploymentId |

Env vars to add:
- `RESEND_API_KEY` (sensitive)
- `RESEND_WEBHOOK_SECRET` (sensitive, for verifying Resend webhook calls)

---

## 9. Open questions for Agla

Before implementation begins, please confirm:

1. **Trigger**: manual admin-panel button first, or wire the Vercel deploy webhook
   from the start?
2. **Seed list**: should the one-time invite go to everyone in `contactMessages`,
   or only a subset?
3. **Email domain**: outbound from `noreply@aglamazo.com`? (Requires Resend domain
   verification for that domain.)
4. **Privacy notice**: write a minimal one inline in this task, or is that a separate
   task/doc?

---

*Proposal complete. Implementation begins after Agla signs off on the above.*
