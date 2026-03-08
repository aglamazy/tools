/**
 * Form Filler Suggest API Route
 * Receives form fields + user's ProfileQA data, returns suggested answers
 * using Claude API for matching and generation.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getLLMClient, type LLMProvider } from '@/app/services/llm'

interface FormField {
  id: string
  type: string
  label: string
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
}

const SYSTEM_PROMPT = `You are a form-filling assistant for musicians and artists.
You receive:
1. A list of form fields (with labels, types, and names)
2. The user's profile data (question-answer pairs about themselves)

Your job:
- Match profile answers to form fields based on semantic similarity of the labels/questions
- For fields without a direct match, generate an appropriate answer based on available profile context
- For file upload fields, return source: "none"
- For select/dropdown fields, return the exact option value that best matches

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
- The form may be in any language. Match fields to profile semantically regardless of language.`

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fields, profileData, provider, apiKey } = body as {
      fields: FormField[]
      profileData?: ProfileQAEntry[]
      provider?: string
      apiKey?: string
    }

    if (!Array.isArray(fields) || fields.length === 0) {
      return NextResponse.json({ success: false, error: 'שדות חסרים' }, { status: 400 })
    }

    // Build the user message with fields and profile data
    const fieldsDescription = fields.map(f => {
      let desc = `- ID: "${f.id}", Label: "${f.label}", Type: ${f.type}, Name: "${f.name}"`
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

    const userMessage = `Form fields:\n${fieldsDescription}\n\nUser profile data:\n${profileDescription}`

    const client = getLLMClient((provider as LLMProvider) || 'anthropic')
    const result = await client.chat({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 2048,
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    })

    if (result.error) {
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
