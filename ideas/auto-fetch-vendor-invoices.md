# Auto-Fetch Vendor Invoices (MCP / Headless Browser)

## Problem

Some vendors don't email PDF invoices — they only post them inside their account portal. Today's matcher can find email-attached receipts (Vercel, AWS, Google), but for vendors like **OpenAI ChatGPT subscriptions**, the email is a one-line "Your subscription renewed" notice with no PDF. The invoice lives only at `platform.openai.com/settings/organization/billing/history` (or the per-product equivalent).

Result: those rows still show ⚠️ ללא מסמך and require the user to manually log in, find the right invoice, download, and click "העלה קובץ" — for every charge, every month.

## Direction: per-vendor portal scrapers

Treat each "portal-only" vendor as a small plugin that:
1. Owns its login URL + invoice-list selectors.
2. Given a transaction (date + amount), navigates to its billing page and downloads the matching invoice PDF.
3. Hands the PDF back to the existing receipt-match pipeline (Drive upload + Claude extract + ExpenseDocument).

Auth happens in the user's real Chrome profile — we never store passwords. The plugin only drives a session the user already logged into.

## Two execution shapes

**A. MCP-driven (supervised)** — same model as `chrome-mcp` already used for the bank scrape. Reuses the persistent Chrome profile at `~/.config/google-chrome-mcp` (login state survives sessions). User logs in once; subsequent runs find the right invoice and click "Download".

- ✅ Trust-light — runs on user's own machine, in their visible browser.
- ✅ No password storage.
- ✅ Works through 2FA (user does it interactively the first time).
- ❌ Requires user's machine running + chrome-mcp launched. Not a hands-off cron.

**B. Headless / cloud** — Playwright / Puppeteer in a managed runtime. Same login the user did once gets serialized (cookies + storage state) into the credentials vault (#10 — encrypted) and replayed.

- ✅ Runs unattended.
- ❌ Requires session-state storage. 2FA flows break unattended runs.
- ❌ More fragile against vendor anti-bot.

Start with **A**, fall back to "open the portal, ask user to confirm session, then drive" hybrid. **B** can come later when the credentials vault is mature.

## Vendor candidates (priority order, by frequency in Yaakov's data)

1. **OpenAI ChatGPT** — `platform.openai.com/settings/organization/billing/history` (API) and ChatGPT subscription portal. Currently the trigger for this idea.
2. **Cloud providers without email PDFs** — confirm which of {AWS, GCP, Cloudflare} fall here vs. attach to email.
3. **Israeli SaaS / utility portals** — חברת חשמל, סלקום (current data has "וואי-פיי הנהלת חשבון" which already attaches PDFs by email — these are the harder ones).

## Plugin shape (sketch)

```ts
// app/services/invoiceFetchers/types.ts
export type InvoiceFetchInput = {
  txId: number
  txDate: string       // ISO YYYY-MM-DD
  description: string  // "OPENAI *CHATGPT SUBS"
  amount: number       // -192 (ILS)
}

export type InvoiceFetchResult =
  | { status: 'fetched'; pdfBase64: string; fileName: string }
  | { status: 'login-required'; loginUrl: string }
  | { status: 'no-match' }
  | { status: 'error'; reason: string }

export interface InvoiceFetcher {
  /** "openai-platform", "vercel-portal", etc. */
  id: string
  /** Vendor-name patterns this fetcher handles (matches transaction.description). */
  matches(description: string): boolean
  fetch(input: InvoiceFetchInput): Promise<InvoiceFetchResult>
}
```

Wire-up: `tryCandidate` (or a sibling step) consults the fetcher registry **before** falling back to the user clicking "העלה קובץ". On success → same Drive upload + Claude extract + ExpenseDocument flow as the Gmail-attachment path. No fetcher match → fall back to manual upload.

## UI

- The "חפש ב-Gmail" button gains a sibling **"הורד מהספק"** when a fetcher is registered for the description's vendor.
- Status pill: `מתחבר... → מאתר... → מוריד... → מאמת... → מסמך`.
- First time per vendor per profile: opens the vendor's login URL in the user's Chrome MCP tab and pauses with "התחבר ואז לחץ המשך". After that, runs unattended for that profile.

## Open questions

- **Confidence**: even with the right invoice list, picking the right row needs date + amount match. Same Claude-verify step as the Gmail flow.
- **Org switching**: OpenAI specifically has the Personal / Agents Head split. The fetcher needs to iterate orgs (or the user's profile remembers which org pays this card).
- **Detection / anti-bot**: portals like Stripe Customer Portal are fine for MCP (real browser). Headless will hit Cloudflare challenges on some.

## Related

- `project_bank_scrape.md` — same MCP-driven model, already proven for Otsar HaHayal.
- Task **#10** (encrypted credentials vault) is the precondition for shape **B**.
