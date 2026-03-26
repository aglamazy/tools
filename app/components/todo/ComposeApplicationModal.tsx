'use client'

import { useState, useEffect, useCallback } from 'react'
import Modal from '@/app/components/Modal'
import { getLLMClient } from '@/app/services/llm'
import { taskSubjectStore } from '@/app/stores/taskSubjectStore'
import type { ApplicationProfile } from '@/app/types/subject'
import { LANGUAGE_LABELS } from '@/app/types/subject'
import type { CombinedTask } from './TaskCard'

type Props = {
  task: CombinedTask | null
  subjectName: string
  onClose: () => void
}

type Section = 'opening' | 'body' | 'closing'

export default function ComposeApplicationModal({ task, subjectName, onClose }: Props) {
  const [profile, setProfile] = useState<ApplicationProfile | null>(null)
  const [language, setLanguage] = useState('en')
  const [opening, setOpening] = useState('')
  const [body, setBody] = useState('')
  const [closing, setClosing] = useState('')
  const [generating, setGenerating] = useState<Section | null>(null)
  const [loading, setLoading] = useState(true)

  const ext = task?.ext?.kind === 'lead' ? task.ext : null

  // Load profile and saved templates from subject
  useEffect(() => {
    if (!subjectName || !task) return
    setLoading(true)
    taskSubjectStore.get(subjectName).then(data => {
      if (data?.application) {
        setProfile(data.application)
        setLanguage(data.application.defaultLanguage || 'en')
        setOpening(data.application.openingTemplate || '')
        setBody(data.application.bodyTemplate || data.application.cvGist || '')
        setClosing(data.application.closingTemplate || '')
      }
      setLoading(false)
    })
  }, [subjectName, task])

  // Save templates back to subject when sections change
  const saveTemplates = useCallback(async () => {
    if (!profile || !subjectName) return
    await taskSubjectStore.updateApplication(subjectName, {
      ...profile,
      openingTemplate: opening,
      bodyTemplate: body,
      closingTemplate: closing,
    })
  }, [profile, subjectName, opening, body, closing])

  const getLeadContext = useCallback(() => {
    if (!task || !ext) return ''
    const parts = [`Name: ${task.title}`]
    if (ext.notes) parts.push(`Info: ${ext.notes}`)
    if (ext.address) parts.push(`Address: ${ext.address}`)
    if (ext.leadTags?.length) parts.push(`Tags: ${ext.leadTags.join(', ')}`)
    for (const link of ext.links.slice(0, 2)) {
      parts.push(`URL: ${link.url}`)
    }
    return parts.join('\n')
  }, [task, ext])

  const generateSection = async (section: Section) => {
    if (!profile) return
    setGenerating(section)
    const llm = getLLMClient('gemini')
    const lang = LANGUAGE_LABELS[language] || language
    const leadCtx = getLeadContext()

    let prompt = ''
    if (section === 'opening') {
      prompt = `Write ONLY the opening paragraph of a formal application letter in ${lang}.
The applicant (${profile.fullName}) is applying to: ${task?.title}.
Context about the foundation/scholarship:
${leadCtx}
The applicant studies ${profile.fieldOfStudy} at ${profile.institution}.
Write 2-3 sentences. Be specific to this foundation. No greeting line, no "Dear", just the opening paragraph.
Return ONLY the paragraph text, no quotes or labels.`
    } else if (section === 'body') {
      prompt = `Translate and adapt the following CV/study description into a formal application letter body paragraph in ${lang}.
Keep the content faithful but make it read naturally as part of a formal letter.
Source text: "${profile.cvGist}"
Return ONLY the translated paragraph text.`
    } else {
      prompt = `Write ONLY the closing of a formal application letter in ${lang}.
Include a brief expression of gratitude and a formal sign-off appropriate for ${lang} culture.
The applicant's name is ${profile.fullName}.
Return ONLY the closing text (2-3 lines including the name).`
    }

    try {
      const result = await llm.chat({
        system: 'You write formal application letters. Return only the requested text, no labels or markdown.',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 1000,
      })
      if (!result.error) {
        const text = result.text.trim()
        if (section === 'opening') setOpening(text)
        else if (section === 'body') setBody(text)
        else setClosing(text)
      }
    } catch (err) {
      console.error(`[Compose] Error generating ${section}:`, err)
    }
    setGenerating(null)
  }

  const generateAll = async () => {
    await generateSection('opening')
    await generateSection('body')
    await generateSection('closing')
  }

  const fullLetter = [opening, body, closing].filter(Boolean).join('\n\n')

  const handleCopy = () => {
    navigator.clipboard.writeText(fullLetter)
  }

  const handleDownload = () => {
    // Create a printable HTML and use browser print-to-PDF
    const title = `Application - ${task?.title || 'Letter'}`
    const html = `<!DOCTYPE html>
<html dir="ltr"><head><meta charset="utf-8"><title>${title}</title>
<style>@page{margin:0;size:A4;}body{font-family:serif;max-width:700px;margin:0 auto;padding:2cm;line-height:1.6;font-size:14px;white-space:pre-wrap;box-sizing:border-box;}@media print{body{padding:2cm;}}</style>
</head><body>${fullLetter.replace(/\n/g, '<br>')}</body></html>`
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.title = title
      win.document.close()
      setTimeout(() => win.print(), 300)
    }
  }

  if (!task) return null

  return (
    <Modal isOpen={!!task} onClose={onClose} maxWidth="900px">
      <div dir="rtl" style={{ padding: '0.5rem', display: 'flex', gap: '1rem', minHeight: '500px' }}>
        {/* Left: Letter editor */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>חיבור מכתב</h3>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                style={{ padding: '0.375rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.85rem' }}
              >
                {Object.entries(LANGUAGE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <button
                onClick={generateAll}
                disabled={!profile || generating !== null}
                style={{
                  padding: '0.375rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8rem',
                  border: '1px solid #c4b5fd', background: '#ede9fe', color: '#7c3aed',
                  cursor: profile && !generating ? 'pointer' : 'not-allowed',
                }}
              >
                {generating ? 'מחולל...' : 'חולל הכל'}
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>טוען פרופיל...</div>
          ) : !profile ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#dc2626', fontSize: '0.9rem' }}>
              יש להגדיר פרופיל מכתב בהגדרות הנושא
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', overflow: 'auto' }}>
              <LetterSection
                label="פתיח"
                value={opening}
                onChange={setOpening}
                onRegenerate={() => generateSection('opening')}
                generating={generating === 'opening'}
                rows={4}
              />
              <LetterSection
                label="גוף"
                value={body}
                onChange={setBody}
                onRegenerate={() => generateSection('body')}
                generating={generating === 'body'}
                rows={6}
              />
              <LetterSection
                label="סיום"
                value={closing}
                onChange={setClosing}
                onRegenerate={() => generateSection('closing')}
                generating={generating === 'closing'}
                rows={3}
              />
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button onClick={() => { saveTemplates(); onClose() }}
              style={{ ...actionBtn, background: '#3b82f6', color: 'white' }}>
              שמור וסגור
            </button>
            <button onClick={handleDownload} disabled={!fullLetter}
              style={{ ...actionBtn, background: fullLetter ? '#059669' : '#94a3b8', color: 'white' }}>
              הורד PDF
            </button>
            <button onClick={handleCopy} disabled={!fullLetter}
              style={{ ...actionBtn, background: '#f1f5f9', border: '1px solid #d1d5db', color: '#374151' }}>
              העתק
            </button>
            <button onClick={onClose} style={{ ...actionBtn, background: '#f1f5f9', border: '1px solid #d1d5db', color: '#374151' }}>
              ביטול
            </button>
          </div>
        </div>

        {/* Right: Lead context */}
        <div style={{
          flex: 1, minWidth: '200px', background: '#f9fafb', borderRadius: '0.375rem',
          padding: '0.75rem', fontSize: '0.85rem', overflow: 'auto',
          border: '1px solid #e5e7eb',
        }}>
          <div style={{ fontWeight: 600, marginBottom: '0.75rem', color: '#374151' }}>{task.title}</div>
          {ext && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {ext.notes && <ContextRow label="הערות" value={ext.notes} />}
              {ext.address && <ContextRow label="כתובת" value={ext.address} />}
              {ext.phone && <ContextRow label="טלפון" value={ext.phone} />}
              {ext.leadTags && ext.leadTags.length > 0 && (
                <ContextRow label="תגיות" value={ext.leadTags.join(', ')} />
              )}
              {ext.links.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>קישורים</div>
                  {ext.links.map((l, i) => (
                    <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'block', color: '#3b82f6', fontSize: '0.8rem', wordBreak: 'break-all' }}>
                      {l.text || l.url}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function LetterSection({ label, value, onChange, onRegenerate, generating, rows }: {
  label: string; value: string; onChange: (v: string) => void
  onRegenerate: () => void; generating: boolean; rows: number
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
        <label style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>{label}</label>
        <button onClick={onRegenerate} disabled={generating}
          style={{
            background: 'none', border: 'none', color: '#7c3aed', cursor: generating ? 'wait' : 'pointer',
            fontSize: '0.75rem', padding: 0,
          }}>
          {generating ? '...' : 'נסח מחדש'}
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        style={{
          width: '100%', padding: '0.5rem', borderRadius: '0.375rem',
          border: '1px solid #d1d5db', fontSize: '0.85rem', boxSizing: 'border-box',
          resize: 'vertical', lineHeight: 1.5, direction: 'ltr',
        }}
      />
    </div>
  )
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>{label}</div>
      <div style={{ color: '#374151', fontSize: '0.8rem' }}>{value}</div>
    </div>
  )
}

const actionBtn: React.CSSProperties = {
  padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer',
  fontWeight: 500, fontSize: '0.85rem', border: 'none',
}
