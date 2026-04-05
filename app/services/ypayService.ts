import { db, type Transaction, type Business } from '@/app/db/financeDB'

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
  if (!business.ypayClientId || !business.ypayClientSecret) {
    throw new Error('פרטי התחברות YPAY לא הוגדרו לעסק')
  }
  return { clientId: business.ypayClientId, clientSecret: business.ypayClientSecret }
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

  createDocument: async (transaction: Transaction, business: Business, contact: YpayContact, vatType?: 'exempt' | 'authorized'): Promise<{ url: string; serialNumber: string }> => {
    const credentials = getCredentials(business)

    const effectiveVatType = vatType || business.vatType
    if (!effectiveVatType) {
      throw new Error('סוג עוסק לא הוגדר — הגדר בפרופיל')
    }

    // קבלה for exempt, חשבונית מס קבלה for authorized
    const docType = effectiveVatType === 'exempt' ? YpayDocType.Receipt : YpayDocType.TaxInvoiceReceipt

    const items = [{
      description: transaction.description,
      quantity: 1,
      price: transaction.amount,
    }]

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
      createdAt: new Date().toISOString(),
    })

    return { url: data.url, serialNumber: data.serialNumber }
  },

  createBusinessInvoice: async (business: Business, params: {
    projectName: string
    totalHours: number
    hourlyRate: number
    monthName: string
    date: string
    contact?: YpayContact
  }): Promise<{ url: string; serialNumber: string }> => {
    const credentials = getCredentials(business)

    const amount = params.totalHours * params.hourlyRate

    const items = [{
      description: `${params.projectName} - ${params.monthName} (${params.totalHours.toFixed(2)} שעות × ${params.hourlyRate} ₪)`,
      quantity: 1,
      price: amount,
    }]

    const response = await fetch('/api/ypay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...credentials,
        action: 'createDocument',
        docType: YpayDocType.BusinessInvoice,
        items,
        date: params.date,
        ...(params.contact ? { contact: params.contact } : {}),
      }),
    })

    const data = await response.json()
    if (!data.success) {
      throw new Error(data.message || 'שגיאה ביצירת חשבונית עסקה')
    }

    await db.ypayDocuments.add({
      transactionId: `invoice:${params.projectName}:${params.monthName}`,
      url: data.url,
      serialNumber: data.serialNumber,
      docType: YpayDocType.BusinessInvoice,
      amount,
      projectName: params.projectName,
      monthName: params.monthName,
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

// Convert DD/MM/YYYY to YYYY-MM-DD for YPAY API
function formatDateForYpay(date: string): string {
  const [day, month, year] = date.split('/')
  return `${year}-${month}-${day}`
}
