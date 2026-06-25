/**
 * Saliko canonical strings — single source of truth (SST).
 *
 * C09 fix: the chat bot was inventing a support address (`support@saliko.ai`)
 * because the canonical contact email lived only in the privacy page and was
 * never given to the chat system prompt. Any user-facing fact that must match
 * across the privacy page AND the chat brain belongs here, imported by both —
 * never re-typed. Add new canon (retention windows, legal entity, etc.) here.
 */

/** The only contact address Saliko may give out. Canonical — never invent another. */
export const SALIKO_CONTACT_EMAIL = 'privacy@saliko.co.il'
