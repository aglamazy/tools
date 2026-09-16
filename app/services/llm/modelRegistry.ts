import { resolveModel, type ModelEntry } from 'agents-models'

/**
 * Single source for every LLM model string Aglamazo hardcodes (aglamazo#406,
 * Yoav/Dasi — Agla caught a raw model literal, then it turned out to be a
 * repo-wide pattern across 12 files, one of them already drifted to a
 * different, wrong string). `agents-models` is the fleet's shared registry;
 * this module is Aglamazo's own thin layer over it, not a replacement.
 *
 * `agents-models`' own MODEL_REGISTRY is now documented as the OFFLINE FLOOR
 * only — the fleet's live source of truth moved to Cockpit's DB, reached via
 * `agents-backoffice/models` (2026-08-07, aglamaz_libs#246). Aglamazo has no
 * Cockpit DB connectivity configured (it's a Dexie/Firestore app, not part
 * of that stack) — wiring that up is a real, separate infra change, not
 * this ticket's scope. The floor is the correct layer for Aglamazo to use
 * as-is; nothing here is a downgrade from what a DB-aware app would get.
 *
 * `overrides` (agents-models' own sanctioned mechanism — see Elron's
 * ELRON_MODEL_OVERRIDES for the established fleet pattern) is why this
 * module exists at all rather than calling `resolveModel` inline everywhere:
 * the floor's built-in `primary` alias still resolves to claude-sonnet-4-5,
 * not claude-sonnet-5 — real, current, and already priced in the floor's
 * own MODEL_PRICING table, just not yet wired to any built-in alias. Routing
 * Aglamazo through the raw `primary` alias today would silently downgrade
 * every Claude call. Worth raising with Dasi/Yoav as its own registry gap;
 * not something to fix by editing the shared floor from inside Aglamazo.
 */
const AGLAMAZO_MODEL_OVERRIDES: Record<string, ModelEntry> = {
  'aglamazo-anthropic': {
    make: 'anthropic',
    model: 'claude-sonnet-5',
    label: 'Aglamazo default Anthropic model — chat + every extraction route',
  },
  // Distinct from the floor's `extraction` alias on purpose (same value
  // today, different role — agents-models' own rule against repurposing an
  // alias's meaning): this is chatProcessor's escalation when the default
  // model jams on structured tool calls, not document extraction.
  'aglamazo-gemini-chat-escalation': {
    make: 'google',
    model: 'gemini-2.5-pro',
    label: 'Aglamazo chat tool-call escalation when the default model jams',
  },
  // geminiService.ts's Gmail-filter-criteria extraction — legacy pin, not
  // yet reviewed for a 2.5-line upgrade. Named/tracked here so it stops
  // being an untracked literal, not a claim that 2.0 Flash is still right.
  'aglamazo-gemini-legacy-filter': {
    make: 'google',
    model: 'gemini-2.0-flash',
    label: 'Aglamazo Gmail-filter-criteria extraction (legacy, unreviewed)',
  },
}

/** Resolve an Aglamazo or fleet-floor alias to its current model id string. */
export function aglamazoModel(alias: string): string {
  return resolveModel(alias, AGLAMAZO_MODEL_OVERRIDES).model
}

// The exact strings every call site should import instead of a literal.
export const ANTHROPIC_MODEL = aglamazoModel('aglamazo-anthropic')
export const GEMINI_FLASH_MODEL = aglamazoModel('fallback') // floor alias — value already matches, no override needed
export const GEMINI_PRO_MODEL = aglamazoModel('extraction') // floor alias — structured extraction, exact numeric OCR
export const GEMINI_CHAT_ESCALATION_MODEL = aglamazoModel('aglamazo-gemini-chat-escalation')
export const GEMINI_LEGACY_FILTER_MODEL = aglamazoModel('aglamazo-gemini-legacy-filter')
