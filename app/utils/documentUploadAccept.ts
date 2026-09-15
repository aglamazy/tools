/**
 * Shared `accept` list for every document-upload file input (receipts, BTL
 * notices, VAT payment confirmations). gov.il issues confirmations as
 * `.html`, and a receipt/PDF can be an image — one list, one edit point.
 *
 * aglamazo#400: `#392` added `.html,.htm` to two of the three inputs that
 * accept a gov.il confirmation; the third (VAT payment) kept the old list
 * and silently greyed the file out in the picker. Filed as "same class as
 * #395, #396" — three separate fixes each touched one of several sibling
 * call sites and missed another. This constant is the fix for the class,
 * not just this instance: every call site imports it instead of retyping.
 */
export const DOCUMENT_UPLOAD_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.html,.htm'
