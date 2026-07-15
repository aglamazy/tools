import { db, type Transaction, type Business, type YpayDocument } from '@/app/db/financeDB'
import { normalizeDate } from '@/app/utils/parsers/shared'
import { VAT_RATE_AUTHORIZED_DEALER } from '@/app/lib/vat'

export type YpayCredentials = {
  clientId: string
  clientSecret: string
}

export type YpayContact = {
  email: string             // required - used for matching
  businessID?: string       // ח.פ - used for matching
  name?: string
  phone?: string
  mobile?: string
  zipcode?: string
  website?: string
  address?: string
  comments?: string
}

export enum YpayDocType {
  PriceQuote = 101,       // הצעת מחיר
  ReturnCertificate = 102, // תעודת החזרה
  WorkOrder = 103,         // הזמנת עבודה
  BusinessInvoice = 104,   // חשבונית עסקה
  ShippingCertificate = 105, // תעודת משלוח
  TaxInvoice = 106,        // חשבונית מס
  TaxInvoiceCredit = 107,  // חשבונית מס זיכוי
  Receipt = 108,           // קבלה
  TaxInvoiceReceipt = 109, // חשבונית מס קבלה
  NoDocument = 0,          // ללא מסמך
}

export enum YpayPaymentMethod {
  Cash = 1,        // מזומן
  BankTransfer = 2, // העברה בנקאית
  Check = 3,       // שיק
  CreditCard = 4,  // אשראי
  PayPal = 5,      // פייפאל
  App = 6,         // אפליקציית תשלום
}

export enum YpayAppType {
  Bit = 'bit',
  Paybox = 'paybox',
  Pepper = 'pepper',
  ApplePay = 'applepay',
  GooglePay = 'googlepay',
  Bitcoin = 'bitcoin',
  Ethereum = 'ethereum',
  Payoneer = 'payoneer',
  Other = 'Other',
}

export enum YpayCreditCardType {
  Visa = 1,
  Mastercard = 2,
  AmericanExpress = 3,
  Isracard = 4,
  Diners = 5,
}

function getCredentials(business: Business): YpayCredentials {
  // Sandbox pair is validated first — the whole point is to catch a missing/
  // wrong sandbox setup before it silently falls through to production creds.
  if (business.ypayUseSandbox) {
    if (!business.ypaySandboxClientId || !business.ypaySandboxClientSecret) {
      throw new Error('מצב Sandbox פעיל אך פרטי ההתחברות לסביבת ה-Sandbox לא הוגדרו')
    }
    return { clientId: business.ypaySandboxClientId, clientSecret: business.ypaySandboxClientSecret }
  }
  if (!business.ypayClientId || !business.ypayClientSecret) {
    throw new Error('פרטי התחברות YPAY לא הוגדרו לעסק')
  }
  return { clientId: business.ypayClientId, clientSecret: business.ypayClientSecret }
}

// Pre-payment billing document — depends on dealer VAT status:
//   exempt     → 104 חשבונית עסקה
//   authorized → 106 חשבונית מס
// (Post-payment receipt docs are picked separately in createDocument.)
function getBillingDocType(business: Business, vatType?: 'exempt' | 'authorized'): YpayDocType {
  const effective = vatType || business.vatType
  if (!effective) {
    throw new Error('סוג עוסק לא הוגדר — הגדר בפרופיל')
  }
  return effective === 'exempt' ? YpayDocType.BusinessInvoice : YpayDocType.TaxInvoice
}

// Tax invoices (106, authorized dealer) carry a net pre-VAT amount, so the
// full payable total needs VAT grossed up. Business invoices (104, exempt
// dealer — no VAT charged at all) can coexist in the same list after a
// dealer-status change, and their amount is already the full total.
// A receipt's allocation toward an invoice is always gross (a slice of the
// actual bank transfer), so both sides need to be in the same (gross) terms.
export function invoiceGrossAmount(invoice: YpayDocument): number {
  const amount = invoice.amount || 0
  return invoice.docType === YpayDocType.TaxInvoice ? amount * (1 + VAT_RATE_AUTHORIZED_DEALER) : amount
}

// Sum of every receipt's allocation toward this invoice, across ALL receipts
// (a single invoice can be paid off by more than one receipt over time — a
// partial payment now, the remainder later). This is computed live rather
// than denormalized onto the invoice, so there's no stale-total bug to chase.
export function computeInvoicePaidAmount(invoiceDocId: number, allDocs: YpayDocument[]): number {
  let total = 0
  for (const d of allDocs) {
    for (const alloc of d.closesAllocations || []) {
      if (alloc.docId === invoiceDocId) total += alloc.amount
    }
  }
  return total
}

// Epsilon-tolerant "is this invoice fully paid off" check — floating point
// gross-up arithmetic won't land on an exact cent otherwise.
export function isInvoiceFullyPaid(invoice: YpayDocument, allDocs: YpayDocument[]): boolean {
  if (invoice.id == null) return false
  const paid = computeInvoicePaidAmount(invoice.id, allDocs)
  return paid >= invoiceGrossAmount(invoice) - 0.01
}

// Shared by ypayService.createDocument and IncomeTab's handleLinkDocument
// (the "קשר" manual-link flow, which writes its own ypayDocuments row
// instead of going through createDocument) — after a receipt with
// closesAllocations has been saved, stamp paidAt on whichever referenced
// invoices are now fully covered across ALL their receipts. A partially
// covered invoice is left untouched — still open, with the remainder
// discoverable via computeInvoicePaidAmount.
export async function closeFullyPaidInvoices(closesAllocations: { docId: number; amount: number }[], paidAt: string): Promise<void> {
  if (closesAllocations.length === 0) return
  const allDocs = await db.ypayDocuments.toArray()
  const invoices = await db.ypayDocuments.bulkGet(closesAllocations.map((a) => a.docId))
  await Promise.all(
    invoices
      .filter((inv): inv is YpayDocument => !!inv && !inv.paidAt && isInvoiceFullyPaid(inv, allDocs))
      .map((inv) => db.ypayDocuments.update(inv.id!, { paidAt }))
  )
}

export const ypayService = {
  testConnection: async (credentials: YpayCredentials): Promise<{ success: boolean; message: string }> => {
    const response = await fetch('/api/ypay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    })
    return response.json()
  },

  createDocument: async (transaction: Transaction, business: Business, contact: YpayContact, vatType?: 'exempt' | 'authorized', closesAllocations?: { docId: number; amount: number }[]): Promise<{ url: string; serialNumber: string }> => {
    const credentials = getCredentials(business)

    const effectiveVatType = vatType || business.vatType
    if (!effectiveVatType) {
      throw new Error('סוג עוסק לא הוגדר — הגדר בפרופיל')
    }

    // קבלה (Receipt, docType 108) records a PAYMENT received — used whenever
    // there's a separate tax invoice already covering the VAT: exempt dealers
    // never charge VAT at all, and an authorized-dealer payment that's closing
    // an existing invoice (closesAllocations set, case 3's B2B-split flow)
    // already had its VAT reported on that invoice — issuing 109 here too
    // would DOUBLE-issue it. But an authorized-dealer payment with NO linked
    // invoice (B2C-style: paid directly, no separate billing step) never had
    // its VAT reported anywhere — that case needs the combined חשבונית מס קבלה
    // (109), same as createPaymentLink's docType choice for a direct charge.
    const closesExistingInvoice = !!closesAllocations && closesAllocations.length > 0
    const docType = effectiveVatType === 'exempt' || closesExistingInvoice
      ? YpayDocType.Receipt
      : YpayDocType.TaxInvoiceReceipt

    // Item is required by the API but YPAY doesn't render an items breakdown
    // for receipts at all (docType 108 is explicitly excluded — API docs,
    // Item object). So a per-invoice split here is silently ignored on a 108
    // document; the only field that DOES show is `details` (a free-text note),
    // which is where the invoice references + amounts belong instead. A 109
    // DOES render items and DOES need correct VAT math: `transaction.amount`
    // is the gross amount actually received, so `vatIncluded: true` tells YPAY
    // to extract VAT out of that total rather than add VAT on top of it —
    // keeping the document total equal to `methods[].total` below.
    const items = [{
      description: transaction.description,
      quantity: 1,
      price: transaction.amount,
      vatIncluded: docType === YpayDocType.TaxInvoiceReceipt,
    }]

    let details: string | undefined
    if (closesAllocations && closesAllocations.length > 0) {
      const invoiceDocs = await db.ypayDocuments.bulkGet(closesAllocations.map((a) => a.docId))
      const refs = closesAllocations.map((a) => {
        const inv = invoiceDocs.find((d) => d?.id === a.docId)
        const isPartial = inv ? a.amount < invoiceGrossAmount(inv) - 0.01 : false
        return `#${inv?.serialNumber ?? a.docId} (₪${a.amount.toFixed(2)}${isPartial ? ', כיסוי חלקי' : ''})`
      })
      details = `סוגר חשבוניות: ${refs.join(', ')}`
    }

    const methods = [{
      type: YpayPaymentMethod.BankTransfer,
      total: transaction.amount,
      date: formatDateForYpay(transaction.date),
    }]

    const response = await fetch('/api/ypay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...credentials,
        action: 'createDocument',
        docType,
        items,
        methods,
        contact,
        ...(details ? { details } : {}),
      }),
    })

    const data = await response.json()
    if (!data.success) {
      throw new Error(data.message || 'שגיאה ביצירת מסמך')
    }

    await db.ypayDocuments.add({
      transactionId: String(transaction.id),
      url: data.url,
      serialNumber: data.serialNumber,
      docType,
      closesAllocations,
      createdAt: new Date().toISOString(),
    })

    // Close the circle: a receipt allocated against one or more open invoices
    // (B2B split flow — one payment can fully cover several invoices and
    // partially cover one more) stamps paidAt on each invoice that's now
    // fully covered across all its receipts — paidAt reflects when the money
    // actually arrived (the transaction's own date), not whenever this button
    // was clicked. A partially-covered invoice stays open.
    if (closesAllocations && closesAllocations.length > 0) {
      await closeFullyPaidInvoices(closesAllocations, new Date(formatDateForYpay(transaction.date)).toISOString())
    }

    return { url: data.url, serialNumber: data.serialNumber }
  },

  // Credit-clearing payment link (#73). Builds a YPAY-hosted payment page for
  // the given items and returns its shareable URL. `items[].vatIncluded` carries
  // the per-line VAT toggle: false = price is net, YPAY adds VAT at the dealer's
  // registered rate (the "not including VAT" default); true = price is gross.
  // docType mirrors the dealer status (exempt→108 קבלה, authorized→109 חשבונית מס/קבלה)
  // so YPAY issues the right receipt on a successful charge.
  createPaymentLink: async (business: Business, params: {
    items: Array<{ name?: string; description: string; price: number; quantity: number; vatIncluded: boolean }>
    contact: YpayContact
    payments?: number
    vatType?: 'exempt' | 'authorized'
    /** Gross total for display on our page + income list (YPAY computes its own;
     *  this is what the user sees, VAT included). */
    amount?: number
    /** Save the customer's CC token for future/recurring charges (retainer). */
    saveToken?: boolean
  }): Promise<{ url: string; chargeIdentifier: string }> => {
    const credentials = getCredentials(business)
    const effectiveVatType = params.vatType || business.vatType
    if (!effectiveVatType) {
      throw new Error('סוג עוסק לא הוגדר — הגדר בפרופיל')
    }
    const docType = effectiveVatType === 'exempt' ? YpayDocType.Receipt : YpayDocType.TaxInvoiceReceipt
    const chargeIdentifier = `agl-${business.id}-${crypto.randomUUID()}`
    const appOrigin = typeof window !== 'undefined' ? window.location.origin : ''

    const response = await fetch('/api/ypay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...credentials,
        action: 'createPayment',
        chargeIdentifier,
        docType,
        mail: true,
        items: params.items,
        contact: params.contact,
        ...(params.payments ? { payments: params.payments } : {}),
        // For persistence + our branded page / income list:
        businessId: business.id,
        businessName: business.name,
        ownerUserId: business.userId,
        ...(params.amount !== undefined ? { amount: params.amount } : {}),
        ...(params.saveToken ? { saveToken: true } : {}),
        appOrigin,
      }),
    })

    const data = await response.json()
    if (!data.success) {
      throw new Error(data.message || 'שגיאה ביצירת דף תשלום')
    }
    return { url: data.url, chargeIdentifier }
  },

  createBusinessInvoice: async (business: Business, params: {
    projectName: string
    totalHours: number
    hourlyRate: number
    monthName: string
    date: string
    contact?: YpayContact
    vatType?: 'exempt' | 'authorized'
  }): Promise<{ url: string; serialNumber: string }> => {
    const credentials = getCredentials(business)
    const docType = getBillingDocType(business, params.vatType)

    const amount = params.totalHours * params.hourlyRate

    const items = [{
      description: `${params.projectName} - ${params.monthName} (${params.totalHours.toFixed(2)} שעות × ${params.hourlyRate} ₪)`,
      quantity: 1,
      price: amount,
      vatIncluded: false,
    }]

    const response = await fetch('/api/ypay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...credentials,
        action: 'createDocument',
        docType,
        items,
        date: params.date,
        ...(params.contact ? { contact: params.contact } : {}),
      }),
    })

    const data = await response.json()
    if (!data.success) {
      throw new Error(data.message || 'שגיאה ביצירת חשבונית')
    }

    await db.ypayDocuments.add({
      transactionId: `invoice:${params.projectName}:${params.monthName}`,
      url: data.url,
      serialNumber: data.serialNumber,
      docType,
      amount,
      projectName: params.projectName,
      monthName: params.monthName,
      createdAt: new Date().toISOString(),
    })

    return { url: data.url, serialNumber: data.serialNumber }
  },

  // Multi-month invoice: one YPAY document with one line item per month, so a
  // single invoice can cover e.g. May + June. Each included month gets its own
  // `invoice:project:month` record (all sharing the issued doc's url/serial), so
  // every covered month is marked invoiced and won't be re-suggested.
  createMultiMonthInvoice: async (business: Business, params: {
    projectName: string
    months: Array<{ monthName: string; totalHours: number }>
    hourlyRate: number
    date: string
    contact?: YpayContact
    vatType?: 'exempt' | 'authorized'
  }): Promise<{ url: string; serialNumber: string }> => {
    const credentials = getCredentials(business)
    const docType = getBillingDocType(business, params.vatType)

    const items = params.months.map(m => ({
      description: `${params.projectName} - ${m.monthName} (${m.totalHours.toFixed(2)} שעות × ${params.hourlyRate} ₪)`,
      quantity: 1,
      price: m.totalHours * params.hourlyRate,
      vatIncluded: false,
    }))

    const response = await fetch('/api/ypay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...credentials,
        action: 'createDocument',
        docType,
        items,
        date: params.date,
        ...(params.contact ? { contact: params.contact } : {}),
      }),
    })

    const data = await response.json()
    if (!data.success) {
      throw new Error(data.message || 'שגיאה ביצירת חשבונית')
    }

    const createdAt = new Date().toISOString()
    for (const m of params.months) {
      await db.ypayDocuments.add({
        transactionId: `invoice:${params.projectName}:${m.monthName}`,
        url: data.url,
        serialNumber: data.serialNumber,
        docType,
        amount: m.totalHours * params.hourlyRate,
        projectName: params.projectName,
        monthName: m.monthName,
        createdAt,
      })
    }

    return { url: data.url, serialNumber: data.serialNumber }
  },

  createItemBasedInvoice: async (business: Business, params: {
    projectName: string
    items: Array<{ description: string; quantity: number; price: number }>
    date: string
    contact?: YpayContact
    vatType?: 'exempt' | 'authorized'
  }): Promise<{ url: string; serialNumber: string }> => {
    const credentials = getCredentials(business)
    const docType = getBillingDocType(business, params.vatType)

    const amount = params.items.reduce((sum, it) => sum + it.quantity * it.price, 0)

    // Each line gets `vatIncluded: false` (price is net, YPAY adds VAT for
    // authorized dealers — docType 106). Without this field YPAY treats the
    // line as VAT-exempt regardless of docType.
    const items = params.items.map(it => ({ ...it, vatIncluded: false }))

    const response = await fetch('/api/ypay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...credentials,
        action: 'createDocument',
        docType,
        items,
        date: params.date,
        ...(params.contact ? { contact: params.contact } : {}),
      }),
    })

    const data = await response.json()
    if (!data.success) {
      throw new Error(data.message || 'שגיאה ביצירת חשבונית')
    }

    await db.ypayDocuments.add({
      transactionId: `invoice-items:${data.serialNumber}`,
      url: data.url,
      serialNumber: data.serialNumber,
      docType,
      amount,
      projectName: params.projectName,
      createdAt: new Date().toISOString(),
    })

    return { url: data.url, serialNumber: data.serialNumber }
  },

  listDocuments: async (business: Business): Promise<Array<{ serial_number: string; url: string; docType?: number }>> => {
    const credentials = getCredentials(business)

    const response = await fetch('/api/ypay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...credentials,
        action: 'listDocuments',
      }),
    })

    const data = await response.json()
    if (!data.success) {
      throw new Error(data.message || 'שגיאה בטעינת מסמכים')
    }

    return data.documents || []
  },

  downloadPdf: async (pdfUrl: string): Promise<{ success: boolean; base64?: string; error?: string }> => {
    try {
      const response = await fetch('/api/ypay/pdf?' + new URLSearchParams({ url: pdfUrl }))
      const data = await response.json()
      if (!data.success) {
        return { success: false, error: data.message || 'שגיאה בהורדת PDF' }
      }
      return { success: true, base64: data.base64 }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
}

// YPAY's Method.date field wants Y-m-d (YYYY-MM-DD) — the same canonical
// format normalizeDate() already produces. Transaction.date is stored as
// YYYY-MM-DD for most rows (FIBI/credit parsers, PDF-LLM via synthetic
// rows) but legacy/edge-case rows can still be DD/MM/YYYY — normalizeDate
// handles both. A naive `.split('/')` here silently produced
// "undefined-undefined-<date>" for the common YYYY-MM-DD case, which YPAY
// couldn't parse and defaulted to today's date instead.
export function formatDateForYpay(date: string): string {
  return normalizeDate(date) || date
}
