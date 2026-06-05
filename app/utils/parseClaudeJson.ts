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
 * Strip a leading/trailing ```json (or plain ```) fence from a string and
 * extract the first balanced JSON object/array within. Tolerates:
 *  - markdown fences (```json ... ``` or ``` ... ```)
 *  - English/Hebrew prose preambles before the JSON ("Here's the result:" /
 *    "זהו — חשבונית בסך...")
 *  - prose trailing the JSON
 *  - truncated output with opening fence but no closing fence
 *
 * If no valid JSON-looking braces are found, returns the (de-fenced) input
 * unchanged so JSON.parse will throw the original SyntaxError downstream.
 */
export function stripJsonFences(s: string): string {
  const trimmed = s.trim()

  // 1. If a complete fenced block is present, prefer its inner content —
  //    handles the canonical "```json\n{...}\n```" Claude output.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenced && fenced[1]
    ? fenced[1].trim()
    : trimmed
        // 1b. Otherwise strip partial fences (truncated open / orphan close).
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim()

  // 2. Extract the first balanced {...} or [...] block from the candidate.
  //    Claude sometimes prefixes the JSON with prose ("Here's...", or a
  //    Hebrew explanation) even when asked not to. Looking for the first
  //    opening brace and the last matching closing brace handles this
  //    without needing a real JSON tokenizer.
  const firstObj = candidate.indexOf('{')
  const firstArr = candidate.indexOf('[')
  const start =
    firstObj === -1
      ? firstArr
      : firstArr === -1
        ? firstObj
        : Math.min(firstObj, firstArr)
  if (start === -1) return candidate
  const closer = candidate[start] === '{' ? '}' : ']'
  const end = candidate.lastIndexOf(closer)
  if (end <= start) return candidate
  return candidate.slice(start, end + 1).trim()
}
