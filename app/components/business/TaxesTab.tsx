'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { db, type TaxDocument } from '@/app/db/financeDB'
import {
  requestGoogleAccess,
  uploadTaxDocument,
  downloadDriveFile,
} from '@/app/services/googleDriveService'
import { getAccessToken } from '@/app/services/googleTokenService'
import { getUser } from '@/app/stores/authStore'
import { getHouseholdInfo } from '@/app/services/householdService'
import YesNoModal from '@/app/components/YesNoModal'

type HouseholdMember = { uid: string; label: string }

async function loadHouseholdMembers(): Promise<HouseholdMember[]> {
  const currentUser = getUser()
  const members: HouseholdMember[] = []
  try {
    const info = await getHouseholdInfo()
    if (info.household) {
      const emails = (info.household as any).memberEmails || {}
      const names = (info.household as any).memberNames || {}
      for (const uid of info.household.members) {
        members.push({ uid, label: names[uid] || emails[uid] || uid })
      }
      return members
    }
  } catch { /* no household */ }
  // Fallback: just current user
  if (currentUser) {
    members.push({ uid: currentUser.uid, label: currentUser.displayName || currentUser.email || currentUser.uid })
  }
  return members
}

type SubTab = 'files' | 'summary'

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'files', label: 'קבצים' },
  { id: 'summary', label: 'סיכום שנתי' },
]

export default function TaxesTab() {
  const [subTab, setSubTab] = useState<SubTab>('files')

  return (
    <div>
      {/* Sub-tab bar */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1rem',
        borderBottom: '1px solid #e2e8f0',
        paddingBottom: '0.5rem',
      }}>
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: '0.4rem 1rem',
              fontSize: '0.85rem',
              fontWeight: subTab === t.id ? 600 : 400,
              background: subTab === t.id ? '#eff6ff' : 'transparent',
              border: 'none',
              borderBottom: subTab === t.id ? '2px solid #3b82f6' : '2px solid transparent',
              cursor: 'pointer',
              color: subTab === t.id ? '#1e40af' : '#64748b',
              borderRadius: '0.25rem 0.25rem 0 0',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'files' && <FilesSubTab />}
      {subTab === 'summary' && <AnnualSummarySubTab />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Annual Summary Sub-Tab
// ---------------------------------------------------------------------------

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

function AnnualSummarySubTab() {
  const [docs, setDocs] = useState<TaxDocument[]>([])
  const [loading, setLoading] = useState(true)
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() // 0-based

  useEffect(() => {
    db.taxDocuments
      .filter(d => d.year === currentYear)
      .toArray()
      .then(all => {
        setDocs(all)
        setLoading(false)
      })
  }, [currentYear])

  if (loading) return <p style={{ textAlign: 'center', color: '#94a3b8' }}>טוען...</p>

  // Build monthly rows (Jan through current month)
  const monthlyData = Array.from({ length: currentMonth + 1 }, (_, i) => {
    const monthStr = `${String(i + 1).padStart(2, '0')}/${currentYear}`
    const monthDocs = docs.filter(d => d.month === monthStr)
    return {
      month: i,
      label: HEBREW_MONTHS[i],
      grossIncome: monthDocs.reduce((s, d) => s + (d.grossIncome || 0), 0),
      incomeTax: monthDocs.reduce((s, d) => s + (d.incomeTax || 0), 0),
      nationalInsurance: monthDocs.reduce((s, d) => s + (d.nationalInsurance || 0), 0),
      healthInsurance: monthDocs.reduce((s, d) => s + (d.healthInsurance || 0), 0),
      netIncome: monthDocs.reduce((s, d) => s + (d.netIncome || 0), 0),
    }
  })

  const totals = {
    grossIncome: monthlyData.reduce((s, m) => s + m.grossIncome, 0),
    incomeTax: monthlyData.reduce((s, m) => s + m.incomeTax, 0),
    nationalInsurance: monthlyData.reduce((s, m) => s + m.nationalInsurance, 0),
    healthInsurance: monthlyData.reduce((s, m) => s + m.healthInsurance, 0),
    netIncome: monthlyData.reduce((s, m) => s + m.netIncome, 0),
  }

  const fmt = (n: number) => n.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })

  const cellStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem',
    fontSize: '0.85rem',
    textAlign: 'left' as const,
    direction: 'ltr',
  }

  const headerStyle: React.CSSProperties = {
    ...cellStyle,
    fontWeight: 600,
    background: '#f8fafc',
    color: '#475569',
    borderBottom: '2px solid #e2e8f0',
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>סיכום שנתי {currentYear}</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th style={{ ...headerStyle, textAlign: 'right', direction: 'rtl' }}>חודש</th>
            <th style={headerStyle}>ברוטו</th>
            <th style={headerStyle}>מס הכנסה</th>
            <th style={headerStyle}>ביטוח לאומי</th>
            <th style={headerStyle}>ביטוח בריאות</th>
            <th style={headerStyle}>נטו</th>
          </tr>
        </thead>
        <tbody>
          {monthlyData.map(row => (
            <tr key={row.month} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 500 }}>{row.label}</td>
              <td style={cellStyle}>{row.grossIncome ? fmt(row.grossIncome) : '—'}</td>
              <td style={cellStyle}>{row.incomeTax ? fmt(row.incomeTax) : '—'}</td>
              <td style={cellStyle}>{row.nationalInsurance ? fmt(row.nationalInsurance) : '—'}</td>
              <td style={cellStyle}>{row.healthInsurance ? fmt(row.healthInsurance) : '—'}</td>
              <td style={cellStyle}>{row.netIncome ? fmt(row.netIncome) : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f0fdf4' }}>
            <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 700 }}>סה&quot;כ</td>
            <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(totals.grossIncome)}</td>
            <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(totals.incomeTax)}</td>
            <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(totals.nationalInsurance)}</td>
            <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(totals.healthInsurance)}</td>
            <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(totals.netIncome)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Files Sub-Tab
// ---------------------------------------------------------------------------

function FilesSubTab() {
  const [docs, setDocs] = useState<TaxDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [driveConnected, setDriveConnected] = useState(false)
  const [claudeApiKey, setClaudeApiKey] = useState('')
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDocs = useCallback(async () => {
    const all = (await db.taxDocuments.toArray())
      .sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''))
    setDocs(all)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadDocs()
    loadHouseholdMembers().then(setMembers)
    getAccessToken().then(token => setDriveConnected(!!token))
    // Load saved Claude API key
    db.appSettings.where('key').equals('claudeApiKey').first().then(row => {
      if (row?.value) setClaudeApiKey(row.value as string)
    })
  }, [loadDocs])

  const handleConnectDrive = async () => {
    setError(null)
    const result = await requestGoogleAccess()
    if (result.success) {
      setDriveConnected(true)
    } else {
      setError(result.error || 'Failed to connect Google Drive')
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset file input
    e.target.value = ''

    setError(null)
    setUploading(true)

    try {
      // Upload to Google Drive
      let driveFileId: string | undefined
      let driveWebViewLink: string | undefined

      if (driveConnected) {
        const result = await uploadTaxDocument(file)
        driveFileId = result.fileId
        driveWebViewLink = result.webViewLink
      }

      // Save to IndexedDB
      const now = new Date().toISOString()
      const id = await db.taxDocuments.add({
        businessId: 0,
        userId: getUser()?.uid,
        fileName: file.name,
        driveFileId,
        driveWebViewLink,
        month: '',
        year: new Date().getFullYear(),
        uploadedAt: now,
        updatedAt: now,
      })

      await loadDocs()

      // Auto-extract if API key is set
      if (claudeApiKey) {
        const base64 = await fileToBase64(file)
        await extractData(id as number, base64, file.type)
      }
    } catch (err: any) {
      console.error('[TaxesTab] Upload error:', err)
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const extractData = async (docId: number, base64: string, mimeType: string) => {
    if (!claudeApiKey) {
      setError('יש להגדיר Claude API Key בהגדרות (מפתחות API)')
      return
    }

    setExtracting(docId)
    setError(null)

    try {
      const res = await fetch('/api/extract-tax-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: claudeApiKey,
          fileBase64: base64,
          mimeType,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        const detail = errData.details ? `\n${errData.details}` : ''
        throw new Error((errData.error || `Extraction failed (${res.status})`) + detail)
      }

      const data = await res.json()

      await db.taxDocuments.update(docId, {
        month: data.month || '',
        year: data.year || new Date().getFullYear(),
        grossIncome: data.grossIncome,
        incomeTax: data.incomeTax,
        nationalInsurance: data.nationalInsurance,
        healthInsurance: data.healthInsurance,
        netIncome: data.netIncome,
        employer: data.employer,
        annualTaxableIncome: data.annualTaxableIncome,
        extractedData: data,
        updatedAt: new Date().toISOString(),
      })

      await loadDocs()
    } catch (err: any) {
      console.error('[TaxesTab] Extract error:', err)
      setError(err.message || 'Data extraction failed')
    } finally {
      setExtracting(null)
    }
  }

  const handleReExtract = async (doc: TaxDocument) => {
    if (!claudeApiKey) {
      setError('יש להגדיר Claude API Key בהגדרות (מפתחות API)')
      return
    }
    if (!doc.driveFileId || !doc.id) {
      setError('הקובץ לא נמצא ב-Google Drive')
      return
    }
    try {
      const { base64, mimeType } = await downloadDriveFile(doc.driveFileId)
      await extractData(doc.id, base64, mimeType)
    } catch (err: any) {
      setError(err.message || 'Failed to download file from Drive')
    }
  }

  const handleAssignUser = async (docId: number, userId: string) => {
    await db.taxDocuments.update(docId, { userId: userId || undefined, updatedAt: new Date().toISOString() })
    await loadDocs()
  }

  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; doc: TaxDocument | null }>({ isOpen: false, doc: null })

  const handleDelete = (doc: TaxDocument) => {
    if (!doc.id) return
    setDeleteConfirm({ isOpen: true, doc })
  }

  const confirmDelete = async () => {
    const doc = deleteConfirm.doc
    setDeleteConfirm({ isOpen: false, doc: null })
    if (!doc?.id) return
    await db.taxDocuments.delete(doc.id)
    await loadDocs()
  }

  // Compute totals
  const currentMonth = `${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`
  const currentYear = new Date().getFullYear()

  const monthDocs = docs.filter(d => d.month === currentMonth)
  const yearDocs = docs.filter(d => d.year === currentYear)

  const monthIncome = monthDocs.reduce((s, d) => s + (d.grossIncome || 0), 0)
  const yearIncome = yearDocs.reduce((s, d) => s + (d.grossIncome || 0), 0)

  if (loading) return <p style={{ textAlign: 'center', color: '#94a3b8' }}>טוען...</p>

  return (
    <div>
      {/* Totals bar */}
      {docs.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '1.5rem',
          marginBottom: '1rem',
          padding: '0.75rem 1rem',
          background: '#f0fdf4',
          borderRadius: '0.5rem',
          fontSize: '0.9rem',
        }}>
          <div>
            <span style={{ color: '#64748b' }}>הכנסה חודש נוכחי: </span>
            <strong>{monthIncome.toLocaleString('he-IL', { style: 'currency', currency: 'ILS' })}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b' }}>הכנסה שנתית ({currentYear}): </span>
            <strong>{yearIncome.toLocaleString('he-IL', { style: 'currency', currency: 'ILS' })}</strong>
          </div>
        </div>
      )}

      {/* Actions bar */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1rem',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        {!driveConnected && (
          <button
            onClick={handleConnectDrive}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              background: '#4285f4',
              color: '#fff',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            Google Drive חבר
          </button>
        )}
        {driveConnected && (
          <span style={{ fontSize: '0.8rem', color: '#16a34a' }}>Google Drive מחובר</span>
        )}

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.85rem',
            background: uploading ? '#94a3b8' : '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: uploading ? 'not-allowed' : 'pointer',
          }}
        >
          {uploading ? 'מעלה...' : 'העלה קובץ'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

      </div>

      {error && (
        <div style={{
          marginBottom: '1rem',
          padding: '0.5rem 0.75rem',
          background: '#fef2f2',
          color: '#dc2626',
          borderRadius: '0.375rem',
          fontSize: '0.85rem',
        }}>
          {error}
        </div>
      )}

      {/* Documents list */}
      {docs.length === 0 ? (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>
          אין קבצים עדיין. העלה תלוש שכר או מסמך מס.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {docs.map(doc => (
            <div
              key={doc.id}
              style={{
                padding: '0.75rem 1rem',
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem',
                display: 'flex',
                gap: '1rem',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              {/* File info */}
              <div style={{ flex: 1, minWidth: '150px' }}>
                <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                  {doc.driveWebViewLink ? (
                    <a
                      href={doc.driveWebViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#2563eb', textDecoration: 'none' }}
                    >
                      {doc.fileName}
                    </a>
                  ) : doc.fileName}
                </div>
                {doc.month && (
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    {doc.employer && `${doc.employer} · `}{doc.month}
                  </div>
                )}
              </div>

              {/* Extracted data */}
              {doc.grossIncome != null && (
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#475569' }}>
                  <div>
                    <span style={{ color: '#94a3b8' }}>ברוטו: </span>
                    {doc.grossIncome?.toLocaleString('he-IL')}
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8' }}>מס: </span>
                    {doc.incomeTax?.toLocaleString('he-IL')}
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8' }}>נטו: </span>
                    {doc.netIncome?.toLocaleString('he-IL')}
                  </div>
                </div>
              )}

              {/* User assignment */}
              {members.length > 0 && (
                <select
                  value={doc.userId || ''}
                  onChange={e => doc.id && handleAssignUser(doc.id, e.target.value)}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '0.25rem',
                    background: doc.userId ? '#f0fdf4' : '#fff',
                    color: '#475569',
                  }}
                >
                  <option value="">משתמש</option>
                  {members.map(m => (
                    <option key={m.uid} value={m.uid}>{m.label}</option>
                  ))}
                </select>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {extracting === doc.id ? (
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>מחלץ...</span>
                ) : (
                  <>
                    {!doc.grossIncome && (
                      <button
                        onClick={() => handleReExtract(doc)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.75rem',
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          color: '#475569',
                        }}
                      >
                        חלץ נתונים
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(doc)}
                      style={{
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        color: '#dc2626',
                      }}
                    >
                      מחק
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <YesNoModal
        isOpen={deleteConfirm.isOpen}
        question={`למחוק את ${deleteConfirm.doc?.fileName ?? ''}?`}
        onYes={confirmDelete}
        onNo={() => setDeleteConfirm({ isOpen: false, doc: null })}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data:...;base64, prefix
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
