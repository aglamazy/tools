// CALLER-KEYED ROUTE — authenticated via caller's API key
/**
 * Form Filler Suggest API Route
 * Receives form fields + user's ProfileQA data, returns suggested answers
 * using Claude API for matching and generation.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getLLMClient, type LLMProvider } from '@/app/services/llm'
import { withServiceCall } from '@/app/lib/observe'

interface FormField {
  id: string
  type: string
  label: string
  section: string
  name: string
  placeholder: string
  value: string
  required: boolean
  selector: string
  options?: { value: string; text: string }[]
}

interface ProfileQAEntry {
  question: string
  answer: string | string[]
  answerType: string
  tags?: string[]
}

interface FieldSuggestion {
  value: string
  source: 'profile' | 'ai' | 'none'
  siteSpecific?: boolean
  translatedLabel?: string
}

const SYSTEM_PROMPT = `You are a form-filling assistant for musicians and artists.
You receive:
1. A list of form fields (with labels, types, and names)
2. The user's profile data (question-answer pairs about themselves)

Your job:
- Match profile answers to form fields based on semantic similarity of the labels/questions
- For fields without a direct match, generate an appropriate answer based on available profile context
- For file upload fields, return source: "none"
- For select/dropdown fields, return the human-readable option TEXT (not the numeric value). The client will map the text back to the correct option value for the specific form.

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "field_id_1": { "value": "suggested answer", "source": "profile" },
  "field_id_2": { "value": "generated answer", "source": "ai" },
  "field_id_3": { "value": "", "source": "none" }
}

Rules:
- source "profile" = matched directly from profile data
- source "ai" = generated/inferred from profile context
- source "none" = no data available (file uploads, or truly unknown)
- Answer in the same language as the form labels (usually Hebrew)
- Keep answers appropriate for the field type (short for text inputs, longer for textareas)
- For date fields, look at the placeholder or format hint in the field (e.g. "TT.MM.JJJJ" means dd.mm.yyyy, "mm/dd/yyyy" means US format). Output the date in the format the form expects. If no hint, use YYYY-MM-DD.
- The user's profile may store dates in d/m/yy format (e.g. "5/3/90" = March 5, 1990). Convert to the form's expected format.
- The form may be in any language. Match fields to profile semantically regardless of language.

Select/dropdown fields:
- For select fields, you MUST return the EXACT text of one of the provided options. Do not invent values.
- The profile stores canonical English values for enum-like fields (e.g. Gender: "Male", Marital status: "Single").
- Match the profile value to the closest option in the form's language. Examples:
  - Profile "Male" + German form options ["männlich", "weiblich", "divers"] → return "männlich"
  - Profile "Male" + Hebrew form options ["זכר", "נקבה"] → return "זכר"
  - Profile "Male" + English form options ["Male", "Female", "Other"] → return "Male"
- If multiple form fields represent the same concept (e.g. two gender fields), fill all of them consistently.

Site-specific fields:
- Detect if a field is site-specific, meaning its value is unique to this particular website/service (not a general personal fact).
- Examples of site-specific fields: username/login for this site, password, account number, membership ID, API key, site-specific codes.
- Examples of NON site-specific fields: full name, email, phone, address, date of birth — these are general personal facts.
- For site-specific fields, add "siteSpecific": true in the response object for that field.
- For site-specific fields, if matching profile data exists with matching site tags, use it. Otherwise return source "none".
- The page URL/hostname will be provided so you know which site the form belongs to.

Label translation:
- For EVERY field, add a "translatedLabel" key with the label translated to English.
- If the label is already in English, copy it as-is.
- Keep it short and natural (e.g. "Vorname" → "First name", "תאריך לידה" → "Date of birth").
- This helps the user understand foreign-language forms.

Updated response format:
{
  "field_id_1": { "value": "suggested answer", "source": "profile", "translatedLabel": "First name" },
  "field_id_2": { "value": "", "source": "none", "siteSpecific": true, "translatedLabel": "Account ID" },
  "field_id_3": { "value": "", "source": "none", "translatedLabel": "Phone number" }
}`

async function POSTHandler(request: NextRequest) {
  try {
    const body = await request.json()
    const { fields, profileData, provider, apiKey, pageUrl, hostname } = body as {
      fields: FormField[]
      profileData?: ProfileQAEntry[]
      provider?: string
      apiKey?: string
      pageUrl?: string
      hostname?: string
    }

    if (!Array.isArray(fields) || fields.length === 0) {
      return NextResponse.json({ success: false, error: 'שדות חסרים' }, { status: 400 })
    }

    // Build the user message with fields and profile data
    const fieldsDescription = fields.map(f => {
      let desc = `- ID: "${f.id}", Label: "${f.section ? f.section + ' > ' : ''}${f.label}", Type: ${f.type}, Name: "${f.name}"`
      if (f.placeholder) desc += `, Placeholder: "${f.placeholder}"`
      if (f.required) desc += ' (required)'
      if (f.options) desc += `, Options: [${f.options.map(o => o.text).join(', ')}]`
      return desc
    }).join('\n')

    const profileDescription = profileData && profileData.length > 0
      ? profileData.map(p => {
        const answer = Array.isArray(p.answer) ? p.answer.join(', ') : p.answer
        return `- Q: "${p.question}" → A: "${answer}" (type: ${p.answerType}${p.tags?.length ? ', tags: ' + p.tags.join(', ') : ''})`
      }).join('\n')
      : 'No profile data available.'

    const siteInfo = hostname ? `\nPage URL: ${pageUrl || ''}\nHostname: ${hostname}\n` : ''
    const userMessage = `${siteInfo}Form fields:\n${fieldsDescription}\n\nUser profile data:\n${profileDescription}`

    // Use Anthropic if user provided a key, otherwise fall back to Gemini (platform default)
    const anthropicKey = apiKey || process.env.ANTHROPIC_API_KEY
    const resolvedProvider: LLMProvider = (provider as LLMProvider) || (anthropicKey ? 'anthropic' : 'gemini')

    const client = getLLMClient(resolvedProvider)
    const result = await client.chat({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 2048,
      ...(resolvedProvider === 'anthropic' ? { apiKey: anthropicKey } : {}),
    })

    if (result.error) {
      console.error('[Form Filler] LLM error:', result.error)
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    // Parse the JSON response from Claude
    let suggestions: Record<string, FieldSuggestion> = {}
    try {
      // Strip any markdown code fences if present
      let jsonText = result.text.trim()
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
      }
      suggestions = JSON.parse(jsonText)
    } catch {
      console.error('[Form Filler] Failed to parse Claude response:', result.text)
      // Return empty suggestions rather than failing
      suggestions = {}
    }

    return NextResponse.json({ success: true, suggestions })
  } catch (err: unknown) {
    console.error('[Form Filler] Error:', err)
    return NextResponse.json({ success: false, error: 'שגיאה בניתוח הטופס' }, { status: 500 })
  }
}

export const POST = withServiceCall(POSTHandler)
