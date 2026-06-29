# Scope: אדוני התבלינים (adonithatavlinim.co.il) — Saliko Integration

**Task #1975 | Scope-only**

---

## Platform

**Konimbo** — Israeli SaaS e-commerce platform powering the store.
- Store identifier: `adonit` (embedded in checkout and API URLs)
- Checkout URL: `https://secure.konimbo.co.il/orders/adonit/new`
- CDN: AWS CloudFront (`d3m9l0v76dty0.cloudfront.net`)
- No Rexail/Shufersal/WooCommerce — brand-new platform for Saliko

## Authentication

**Email + password** — fits `CredentialsStorePlugin` (same pattern as Shufersal).
- Login endpoint: `POST /customer_login`
- No OTP / SMS required
- No OAuth / social login
- Cookie-based sessions after login

## Konimbo API

Official REST API: `https://api.konimbo.co.il/v1`  
GitHub docs: https://github.com/konimbo/API-Documentation

| Aspect | Detail |
|---|---|
| Auth | Store-owner token (admin API key, NOT customer creds) |
| Format | JSON over HTTPS |
| Rate limit | 100 req / 10 min per token |
| Modules | Products, Orders, Customers, Shopping Carts, Integration |
| Pagination | 20 items/page via response headers |

**Key constraint**: the official API requires a token the *store owner* provides. It is an admin/B2B API — customer email/password does NOT unlock it.

## Search / Catalog

- Search page is **server-rendered HTML** (`/search?q=<query>`) — no client-side JSON API visible
- Products found via search: numeric IDs (e.g. `4281744`), name, price, stock status
- No catalog cache like Rexail — items must be fetched per query
- `listCategories()` possible from HTML navigation structure (sparse)

## Checkout / Cart

- Cart endpoint not exposed in page HTML
- Checkout POST goes to `secure.konimbo.co.il/orders/adonit/new` (shared Konimbo checkout)
- Need browser DevTools session (Chrome MCP) to capture the actual AJAX cart-add call
- `listSlots()` — unknown; spice shops often ship (no scheduled delivery); may return `[]`
- `modifyOrder()` — likely not supported (order-in-flight edit is uncommon on Konimbo)

## Integration Paths

### Path A — Official Konimbo API (Preferred, requires store-owner consent)
Requires contacting the store (972-53-330-3169 / WhatsApp link on site) to request an API token.

If token obtained:
- `search()` → `GET /v1/items?token=<T>&q=<query>`
- `checkout()` → `POST /v1/orders?token=<T>` with cart payload
- `listOrders()` → `GET /v1/orders?token=<T>`
- Structured JSON throughout — clean, no HTML scraping

Effort with token: **MODERATE** (~400–600 lines, `konimboClient.ts`)

### Path B — Reverse-engineer customer web session (No store-owner needed)
1. `login()` → form POST to `/customer_login`, capture session cookie
2. `search()` → fetch `/search?q=<query>`, parse HTML (fragile)
3. `addToCart()` → discover AJAX endpoint via Chrome DevTools; POST with product ID + qty
4. `checkout()` → drive `secure.konimbo.co.il/orders/adonit/new` form
5. `listOrders()` → scrape `/customer_orders`

Effort: **MODERATE-HIGH** (~800–1000 lines), more fragile than Path A.

## Plugin Interface Fit

| Interface | Fit |
|---|---|
| `CredentialsStorePlugin` | ✅ — email/password, same as Shufersal |
| `OtpStorePlugin` | ❌ — not needed |
| `search()` | ✅ — products are searchable |
| `checkout()` | ✅ — cart + order flow exists |
| `listOrders()` | ✅ — `/customer_orders` page |
| `listSlots()` | ❓ — spice shop, likely shipping not delivery; may return `[]` |
| `modifyOrder()` | ❓ — unclear; likely stub returning empty result |
| `cancelOrder()` | ❓ — likely supported via customer account |

## Reuse Value

Konimbo is a major Israeli e-commerce platform (powers hundreds of stores). A generic `konimboClient.ts` parameterized by `storeDomain` + token would serve all Konimbo stores via a registry pattern identical to `rexailStores.ts`.

## Difficulty Estimate

| Scenario | Effort | Risk |
|---|---|---|
| Path A (store-owner token) | 3–4 days | Low — clean API |
| Path B (web scraping) | 4–6 days | Medium — HTML parsing fragility |
| Delivery/slots unknown | +0.5 day | Low — stub if not supported |

**Overall: MODERATE** — new client needed, but plugin interface fits cleanly. Main blocker is discovering the customer-facing cart API (Path B) OR getting the store-owner token (Path A).

## Recommended First Step

Before building: open a Chrome DevTools session on the live site, add one item to cart, and capture the network request for cart-add. That one endpoint determines whether Path B is clean enough to implement without store-owner cooperation.
