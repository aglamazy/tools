/**
 * Parse Claude's text response as JSON, tolerating markdown code fences
 * (```json ... ```) and incidental whitespace/preamble around them.
 *
 * Claude is instructed to return raw JSON, but occasionally wraps the output
 * in a ```json fence anyway. This helper handles both cases.
 *
 * Throws SyntaxError if the cleaned text is not valid JSON — callers should
 * catch and convert to a 502 with the original `raw` payload.
 */
export function parseClaudeJson<T = unknown>(text: string): T {
  return JSON.parse(stripJsonFences(text)) as T
}

/**
 * Strip a leading/trailing ```json (or plain ```) fence from a string.
 * If the string contains a fenced block surrounded by other text, return the
 * fenced content. Otherwise, trim leading/trailing fences if present.
 */
export function stripJsonFences(s: string): string {
  const trimmed = s.trim()

  // If a fenced block is present anywhere, prefer extracting its inner content.
  // This handles the case where Claude adds preamble like "Here's the result:".
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced && fenced[1]) {
    return fenced[1].trim()
  }

  // Otherwise, strip a partial leading fence (no closing fence — e.g. truncated
  // output where the opening fence is present but the response was cut off).
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
}
