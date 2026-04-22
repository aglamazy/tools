# Rexail-compatible Israeli stores (config-only plug-in candidates)

Research date: 2026-04-22. Sourced by online research agent.

## Why this list matters

Our `retalixClient.ts` talks to Rexail's (Retailer Online / קמעונאי און ליין בע"מ) consumer API — the same platform that runs Makor Hashefa. Any store on the same platform is a **config-only** addition to Aglamazo: `RetalixStoreConfig` fields (`siteOrigin`, `apiBase`, `deviceId`, `xWebsite`, `storeId`, `deliveryAreaId`, `deliveryMethod`, `preferredDay`, `preferredHour`) cover the entire surface per store. No new plugin code, no new payment flows, no new auth.

## Confirmed candidates

All verified via the "Powered by Rexail" logo in `/terms-of-use` footer plus the `© קמעונאי און ליין בע"מ` copyright. That template-identical TOU page is the strongest tell short of opening DevTools.

| Store (He / En) | URL | Confidence | Notes |
|---|---|---|---|
| מקור השפע / Makor Hashefa (control) | makor-hashefa.co.il | — | existing integration |
| הירוקה מהמושב / HaYeruka meHaMoshav | green-moshav.co.il | high | fresh produce, home delivery |
| אשישוק / Ashishuk | ashishuk.co.il | high | farm-to-table; fruits, veg, eggs |
| שוק פלורנטין / Shuk Florentin | shuk-florentin.co.il | high | was serving "temporarily unavailable" during research — may be inactive |
| משק הר פרחים / Meshek Har Prachim | ecomeshek.co.il | high | organic; goats/dairy + produce |
| אקספרס מרקט / Express Market | express-market.co.il | high | generic produce |
| המזון / HaMazon | hamazon.delivery | medium | Google-indexed Rexail TOU; live fetch ECONNREFUSED — verify live status |
| פרי בריא / Pri Bari | pri-bari.co.il | high | fruit + veg |
| תנובת הארץ / Tnuvat HaAretz | tnuvat-haaretz.co.il | high | Karnei Shomron; settlement grocery |
| ירקות מהשדה / Yerakot meHaSade | yerakot-mehasade.co.il | high | produce |
| יוד'הלה / Yod'hale (Yehudale greengrocer, Oranit) | yehodale.co.il | high | local ירקניה with broader catalog |
| טנא הפרי / Tena HaPri | tena-hapri.co.il | high | produce |

## 30-second verification recipe

Open any URL above + `/terms-of-use`, scroll to the footer. You'll see the Rexail logo linking to `https://rexail.co.il/` and the `© קמעונאי און ליין בע"מ, 2026` copyright. For a network-layer check, open DevTools on the shop homepage and search requests for `/client/` — any hit confirms the same API shape as our `retalixClient.ts`.

## Deltas to watch before plugging in a new config

These are the expected per-store config changes (pure data):

- `storeId`, `deliveryAreaId`, `xWebsite`, `deviceId`, `siteOrigin` — change per merchant. That's the entire config surface.
- **OTP auth**: same SMS-code flow is expected (Rexail platform default).
- **Catalog vocabulary**: all use `storeProduct`, `requestedSellingUnit`, `cartEstimation` — no surprises.
- **Delivery area gating**: every candidate restricts by ZIP / polygon; new `deliveryAreaId` per config handles it.

## The one real risk: payment gateway

Rexail's platform default (per their own TOU) is **CreditGuard**. Makor Hashefa uses **PayMe**, which our `retalixClient.ts` has hardcoded via the JWT flow in `placeOrder`.

**Before plugging in a new store**, open its checkout in a browser, watch DevTools Network — if the payment step is not PayMe, we need a payment-provider abstraction (Strategy pattern in `retalixClient`). That's the single most likely source of per-store code. Makor Hashefa may actually be the odd one out among this list.

## Rejected candidates (different platform — NOT plug-in compatible)

All "Powered by **Sellio** (sellio.co.il)" — different stack, different API. Do not attempt to add these via `retalixClient`:

- salsila.co.il
- sadeyarok.co.il
- zinger-organic.com
- 123fresh.co.il

No-signal (would require browser verification; no positive Rexail signal from the research):
- haorgani.co.il (independent stack on shop.haorgani.co.il)
- eranorgani.co.il
- carmella.co.il
- meshek-kirshner.co.il
- etzhasade.com

## Sources

- https://rexail.co.il/
- https://rexail.co.il/buyers/ (customer directory)
- https://il.rexail.com/ (consumer portal)
- https://retailer-il.rexail.com/admin/ (merchant admin)
- Verified TOU footers (each store URL above + `/terms-of-use`).
