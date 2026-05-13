/**
 * Scrape Rexail store configs from each Rexail-powered site's __NEXT_DATA__.
 *
 * Each site embeds:
 *   - jsonWebEncryption — the per-chain JWE token (our xWebsite header)
 *   - websites/{N}/...  — storeId in image preload URLs
 *   - deliveryAreaId, etc — in the redux state
 *
 * Output: a TypeScript-ready array of RetalixStoreConfig entries we can paste
 * into the registry. Anonymous map dots are skipped — only named featured stores.
 */
const STORES = [
  { id: 'rexail_10dag',         label: 'תן דג',           description: 'חנות דגים פרימיום',        site: 'https://www.10dag.co.il/' },
  { id: 'rexail_borepri',       label: 'בורא הפרי והירק', description: 'חנות פירות וירקות',       site: 'https://www.borepri.co.il/' },
  { id: 'rexail_hayarkania',    label: 'הירקניה',         description: 'ירקניית בוטיק',            site: 'https://www.hayarkania.co.il/' },
  { id: 'rexail_agvania',       label: 'עגבניה אונליין',  description: 'חנות פירות וירקות',       site: 'https://www.agvania-online.co.il/' },
  { id: 'rexail_meshek_dahan',  label: 'משק דהן',         description: 'משק משפחתי',              site: 'https://www.meshek-dahan.co.il/' },
  { id: 'rexail_haorgani',      label: 'האורגני',         description: 'חנות פירות וירקות',       site: 'https://shop.haorgani.co.il/' },
  { id: 'rexail_baffalo',       label: 'באפלו מיטליז',    description: 'איטליז פרימיום',           site: 'https://www.baffalo.co.il/' },
  { id: 'rexail_artzenu',       label: 'ארצנו',           description: 'איטליז מקומי',             site: 'https://www.artzenu.co.il/' },
  { id: 'rexail_ecomeshek',     label: 'משק הר פרחים',    description: 'משק אורגני',               site: 'https://www.ecomeshek.co.il/' },
  { id: 'rexail_basra',         label: 'בשרה',            description: 'בקר חופש ישראלי',          site: 'https://www.basra.co.il/' },
  { id: 'rexail_ginaorganit',   label: 'הגינה האורגנית',  description: 'פירות וירקות אורגניים',    site: 'https://www.ginaorganit.co.il/' },
]

interface ScrapedConfig {
  id: string
  label: string
  description: string
  siteOrigin: string
  xWebsite: string | null
  storeId: number | null
  deliveryAreaId: number | null
}

function findFirst<T>(s: string, re: RegExp): T | null {
  const m = s.match(re)
  return m ? (m[1] as unknown as T) : null
}

async function scrape(site: string): Promise<{ xWebsite: string | null; storeId: number | null; deliveryAreaId: number | null }> {
  const res = await fetch(site, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) return { xWebsite: null, storeId: null, deliveryAreaId: null }
  const html = await res.text()

  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]+?)<\/script>/)
  if (!m) return { xWebsite: null, storeId: null, deliveryAreaId: null }

  // jsonWebEncryption is the xWebsite token
  const xw = findFirst<string>(m[1], /"jsonWebEncryption":"([^"]+)"/)

  // storeId from preload URL path "websites/{N}/..."
  const sidStr = findFirst<string>(html, /websites\/(\d+)\//)
  const storeId = sidStr ? parseInt(sidStr, 10) : null

  // deliveryAreaId — heuristic
  let deliveryAreaId: number | null = null
  const da1 = m[1].match(/"defaultDeliveryAreaId":(\d+)/)
  const da2 = m[1].match(/"deliveryAreaId":(\d+)/)
  if (da1) deliveryAreaId = parseInt(da1[1], 10)
  else if (da2) deliveryAreaId = parseInt(da2[1], 10)

  return { xWebsite: xw, storeId, deliveryAreaId }
}

;(async () => {
  const results: ScrapedConfig[] = []
  for (const s of STORES) {
    const origin = new URL(s.site).origin
    process.stderr.write(`Scraping ${s.label} (${origin})... `)
    try {
      const cfg = await scrape(s.site)
      results.push({
        id: s.id,
        label: s.label,
        description: s.description,
        siteOrigin: origin,
        ...cfg,
      })
      process.stderr.write(`storeId=${cfg.storeId} xw=${cfg.xWebsite ? 'yes' : 'NO'} deliveryArea=${cfg.deliveryAreaId ?? 'none'}\n`)
    } catch (err) {
      process.stderr.write(`FAILED: ${err instanceof Error ? err.message : String(err)}\n`)
      results.push({ id: s.id, label: s.label, description: s.description, siteOrigin: origin, xWebsite: null, storeId: null, deliveryAreaId: null })
    }
  }

  // Output as JSON for easy paste-into-registry
  console.log(JSON.stringify(results, null, 2))
})()
