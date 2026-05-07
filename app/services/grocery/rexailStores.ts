/**
 * Directory of Rexail-powered specialty stores in Israel.
 *
 * Scraped from https://rexail.co.il/buyers/#stores via
 * scripts/scrape-rexail-configs.ts. Each entry has the per-chain JWE token
 * (xWebsite) and storeId pulled from the chain's __NEXT_DATA__ initial payload.
 *
 * For now this is a directory only — Saliko exposes these in the UI so a
 * visitor can browse, but actual checkout integration still goes through
 * the single retalixPlugin (configured for Makor Hashefa). Wiring a per-store
 * plugin instance is a follow-up refactor.
 */

export interface RexailStoreEntry {
  id: string
  label: string
  description: string
  siteOrigin: string
  storeId: number
  xWebsite: string
  /** deliveryAreaId is per-user (chosen at connect time), not in static config */
}

export const REXAIL_STORES: RexailStoreEntry[] = [
  {
    id: 'rexail_makorhashefa',
    label: 'מקור השפע',
    description: 'רשת חנויות בריאות',
    siteOrigin: 'https://www.makorhashefa.co.il',
    storeId: 180,
    xWebsite: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..Fd0IKxSrb6gyMYWl9-qHPg.WSJZnBSChp-7D5pYeQquVKjZeJFhEFzCJ-IhvfBDBmcg19uvWecP2vIieRGGu0nOzAaE11WxQCTI3zdhIqNaTNCJ3fMFCQDCmztsqs1VE_asLSV375uK1qYdL6uquuuF.9jmt8tegsAQI0rfz6O4A8w',
  },
  {
    id: 'rexail_10dag',
    label: 'תן דג',
    description: 'חנות דגים פרימיום',
    siteOrigin: 'https://www.10dag.co.il',
    storeId: 124,
    xWebsite: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..QfwbvtSbK-QT29f7RMGHnQ.4OhC8zfMDY6eMASZRomOApBcu2eH7pP5lnXRiBYA8DPYyR50v3N7wP_sl5d42b952yeznlA10P2idjm-MYeekIxaJd74OWS5lw_vZ1Y9azZmiAFTvzVXdSoJ_p7k4KoM.l7MA4Vs_9wjCXINhKE6C4Q',
  },
  {
    id: 'rexail_borepri',
    label: 'בורא הפרי והירק',
    description: 'חנות פירות וירקות',
    siteOrigin: 'https://www.borepri.co.il',
    storeId: 151,
    xWebsite: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..sQgftWwKg88xTQy3BfNtLQ.zuB0D64-rqIUc7EIAe2vn1IsWieIpb3la5ZGmN1BcH87cwuacmIdxNl41qUIkdPe41K6d3rgUtJZIgmU0hpTt0LQGzC1NhhRM-2IyfYhGBeas1CqmV_qmPdpcdylTpRc.T1EA-aNeEK_x-M_1j1eZDA',
  },
  {
    id: 'rexail_hayarkania',
    label: 'הירקניה',
    description: 'ירקניית בוטיק',
    siteOrigin: 'https://www.hayarkania.co.il',
    storeId: 205,
    xWebsite: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..KdX0l-lH2Hs0McSa5Im6DA.EQmh2Z4gYJ1NcJ8_pOEGObjlN0J7yUXuWPFCsbR2uuAHCG5n4RFcpzs1sJ2tWk9CYfAHst2h8Zh2RCJmYOg8KkpvsTYVHyxZx0ce5DLRym_GhPnoDs51u3topnVyz_oq.eAYhQDCGsAw_lQnOK4ZL8g',
  },
  {
    id: 'rexail_agvania',
    label: 'עגבניה אונליין',
    description: 'חנות פירות וירקות',
    siteOrigin: 'https://www.agvania-online.co.il',
    storeId: 59,
    xWebsite: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0.._Kar3Dmsu5MtWpnt_vy3cQ.OzudUdDH9oPNNkl_BRQWBWEVfnUMzbjKfXrHiRd6jHPzlYHeKIkXZKBUH7AZcZFAHQDvo4QcHuXFbd7CLitmQt8ASzwrGZzCKTyWk9tTxEOHEYYK0LdeI9faUVvnFYUT.WjPh2mxSw7A3qCgaYbiL6A',
  },
  {
    id: 'rexail_meshek_dahan',
    label: 'משק דהן',
    description: 'משק משפחתי',
    siteOrigin: 'https://www.meshek-dahan.co.il',
    storeId: 165,
    xWebsite: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..D3GK3ehxFLPtwVw0NO-GUQ.fPVuGAR_2-h08Fb4NKBdrO9tz4ZVE22uHk3AdVvuOnVvjVll7nNKHmM-ZrYZV5EDsfLli1G4bh9owl73uIPFlJeIh0f8QjOra5RPd4QCkMFTHfuHxw0VmoyJJkymcSuB.dXKgZqQgvdRpgQZ8bRBt_A',
  },
  {
    id: 'rexail_haorgani',
    label: 'האורגני',
    description: 'חנות פירות וירקות',
    siteOrigin: 'https://shop.haorgani.co.il',
    storeId: 33,
    xWebsite: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..jDl_TC89rzj3Pb9ljy3FwA.fhyNZFB0OQdx1mEhN7PngORfoxQVg3kppPnExJJwMeWM-uX53PxUh9ygZb5nI3QHgTER3deyTkoIinjls8Vf4zeFz4ak80C8Mu-m97ybkyZNQB0lVA6tFNqwoHkLf84m.eAFQx2BWEmgrNkYYRn6qeA',
  },
  {
    id: 'rexail_baffalo',
    label: 'באפלו מיטליז',
    description: 'איטליז פרימיום',
    siteOrigin: 'https://www.baffalo.co.il',
    storeId: 211,
    xWebsite: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..QVwxldNT_Yoq9x9bqqTQgg.lMV6Ezmcr_a1vVzmrWf6wFcRJp4hMwkwn9fFhUYVPmc9SCO0Ozr2x1z6wcAGzy4HYTFzoAfudpZfzVn-dow79CKVDkvtAne9eHbkyXaXO9b3ccIIEnXahebfAfE8mFvN.ZSHraFqhp0RAHIbvuMOjvQ',
  },
  {
    id: 'rexail_artzenu',
    label: 'ארצנו',
    description: 'איטליז מקומי',
    siteOrigin: 'https://www.artzenu.co.il',
    storeId: 275,
    xWebsite: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..SEoSGch7Dp1URwjZnd0f2A.FNCTANVKSzgvS6DH6t5q82Z5hgkvYukpNzdecUgkDPPhGPJitHLFAHmJfKRHqMgTQkTSUjH-wUR77i0WuK_ba3K7hyGnyxLJlgDgcSwYb9DpH7voR9iZzmLBPsGXCta1.T8lxtmOlzBjnWsR_0LJJmA',
  },
  {
    id: 'rexail_ecomeshek',
    label: 'משק הר פרחים',
    description: 'משק אורגני',
    siteOrigin: 'https://www.ecomeshek.co.il',
    storeId: 26,
    xWebsite: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..fjRhNfl1VaMHzG_SRpv1sQ.tRXRNva5TsHbCOlab4Yz9jVI0UfoulWDNXZRikjrLVjvnNuY4UylafrTbaCaVjr1SqOg9aY0WfXMQ4zd2IrF2e-JbeYXvu4r0Ohwm457EgB5U_76rWdDjtTQcSCyoCG7.xNuLnKIQNIDJ4os1l0tNMA',
  },
  {
    id: 'rexail_basra',
    label: 'בשרה',
    description: 'בקר חופש ישראלי',
    siteOrigin: 'https://www.basra.co.il',
    storeId: 161,
    xWebsite: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..GehYuhPeZoXLXSA4Lprq0g.BBaMzXoGA04t7XeSpahGSf-DEY9t_KKybFg0PCGtnWRRDapFXA5gfh4JCzAtvVm_mihcusG3poBgV2L7UgkTcT-FCYxl70CgD6Z2PbJmfBbArANLVJhUezDlgRttwTJf.QeZAKmUufawWEgYfaGdPRQ',
  },
  {
    id: 'rexail_ginaorganit',
    label: 'הגינה האורגנית',
    description: 'פירות וירקות אורגניים',
    siteOrigin: 'https://www.ginaorganit.co.il',
    storeId: 269,
    xWebsite: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..ZA13RoQOZEb7HkTDLrobUw.zmoeVnOjxBW01bb29_fm8V-7o3e3e79JI33Uh8uGie2SXOw0p9WqC9PwQKRjKWfqSq2CA5Qm5qMb1ceLNQcteleRWiVQBg4oMJYW6-k6s-k2Qlo3s_AAAxd7qdSbckuM.jyfEWnjmnyhxphfSGE8wQA',
  },
]

/** Look up a Rexail store entry by id. */
export function getRexailStore(id: string): RexailStoreEntry | undefined {
  return REXAIL_STORES.find(s => s.id === id)
}
