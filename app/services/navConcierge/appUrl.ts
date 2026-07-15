// Same fallback chain as checkoutContinuation.ts's APP_URL — duplicated
// rather than shared since these are two independent features; not worth
// coupling #261's nav-concierge to #275's checkout-continuation module.
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3100')
