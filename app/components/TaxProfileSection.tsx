'use client'

import React, { useEffect, useRef, useState } from 'react'
import { db } from '@/app/db/financeDB'
import Modal from '@/app/components/Modal'
import { LocaleDateInput } from '@/app/components/LocaleInputs'
import { formatDisplayDate } from '@/app/lib/dateUtils'
import { uploadTaxDocument } from '@/app/services/googleDriveService'
import { getAccessToken } from '@/app/services/googleTokenService'
import { getUser } from '@/app/stores/authStore'
import { normalizeDate } from '@/app/utils/parsers/shared'

export type VatConversion = {
  from: 'exempt' | 'authorized'
  to: 'exempt' | 'authorized'
  effectiveDate: string // YYYY-MM-DD
  certificateDriveFileId?: string
  certificateDriveWebViewLink?: string
  certificateFileName?: string
  recordedAt: string // ISO timestamp
}

export type BtlPayment = {
  month: string // MM/YYYY — the BTL period this payment covers
  amount: number
  dueDate: string // YYYY-MM-DD
  paymentUrl?: string // Decoded from the month's QR code on the notice
}

export type BtlNotice = {
  year: number
  amount: number
  driveFileId?: string
  driveWebViewLink?: string
  fileName?: string
  uploadedAt: string // ISO timestamp
  annualTotal?: number
  schedule?: BtlPayment[]
  extractError?: string
}

export type TaxProfile = {
  vatType?: 'exempt' | 'authorized'
  btlAdvancePayment?: number
  btlNotices?: BtlNotice[]
  incomeTaxAdvancePercent?: number
  incomeTaxAdvancePeriod?: 1 | 2
  vatReportPeriod?: 1 | 2 // 1=חודשי, 2=דו-חודשי — VAT (מע״מ) reporting cadence for authorized dealer
  taxOrder?: number
  vatConversion?: VatConversion
}

/**
 * VAT status effective on a given transaction date — not just "whatever the
 * dealer is right now". A dealer who converted exempt→authorized (or the
 * reverse) mid-year has historical transactions on BOTH sides of that date;
 * applying the current status retroactively to all of them is wrong (e.g.
 * stripping VAT from a transaction that predates VAT registration). Falls
 * back to the plain current vatType when no conversion is on record.
 */
export function vatTypeForDate(profile: TaxProfile, transactionDate: string): 'exempt' | 'authorized' | undefined {
  const conversion = profile.vatConversion
  if (!conversion) return profile.vatType
  const normalized = normalizeDate(transactionDate) || transactionDate
  return normalized >= conversion.effectiveDate ? conversion.to : conversion.from
}

const TAX_PROFILE_LEGACY_KEY = 'taxProfile'

function taxProfileKey(uid?: string): string {
  return uid ? `taxProfile:${uid}` : TAX_PROFILE_LEGACY_KEY
}

/**
 * Load tax profile from appSettings (per-member).
 *
 * Lookup order when a uid is provided:
 * 1. `taxProfile:{uid}` — the per-member key (authoritative).
 * 2. If uid matches the currently logged-in user AND the legacy app-wide `taxProfile`
 *    key exists, migrate it once into the per-uid key and return it. This preserves
 *    data for existing single-user setups without letting other members see it.
 * 3. Otherwise return an empty profile — each member must configure their own.
 *
 * Callers with no uid context read the legacy key only (kept for backwards
 * compatibility; all known app callers pass a uid).
 */
export async function getTaxProfile(uid?: string): Promise<TaxProfile> {
  if (uid) {
    const perUser = await db.appSettings.where('key').equals(taxProfileKey(uid)).first()
    if (perUser?.value) return perUser.value as TaxProfile

    // One-time migration: if this is the logged-in user's uid and the legacy key
    // still holds their (pre-per-member) profile, copy it into the per-uid slot.
    if (uid === getUser()?.uid) {
      const legacy = await db.appSettings.where('key').equals(TAX_PROFILE_LEGACY_KEY).first()
      if (legacy?.value) {
        const migrated = legacy.value as TaxProfile
        await saveTaxProfile(migrated, uid)
        return migrated
      }
    }
    return {}
  }
  const legacy = await db.appSettings.where('key').equals(TAX_PROFILE_LEGACY_KEY).first()
  return (legacy?.value as TaxProfile) || {}
}

/**
 * Save tax profile to appSettings under the per-uid key.
 */
export async function saveTaxProfile(profile: TaxProfile, uid?: string): Promise<void> {
  const key = taxProfileKey(uid)
  const existing = await db.appSettings.where('key').equals(key).first()
  if (existing) {
    await db.appSettings.update(existing.id!, { value: profile, updatedAt: new Date().toISOString() })
  } else {
    await db.appSettings.add({ key, value: profile, updatedAt: new Date().toISOString() })
  }
}

type TaxProfileSectionProps = {
  userId?: string
  memberLabel?: string
}

export default function TaxProfileSection({ userId, memberLabel }: TaxProfileSectionProps = {}) {
  const [profile, setProfile] = useState<TaxProfile>({})
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [targetVatType, setTargetVatType] = useState<'exempt' | 'authorized'>('exempt')
  const [conversionDate, setConversionDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [conversionFile, setConversionFile] = useState<File | null>(null)
  const [conversionUploading, setConversionUploading] = useState(false)
  const [conversionError, setConversionError] = useState('')
  const conversionFileInputRef = useRef<HTMLInputElement>(null)
  const [btlModalOpen, setBtlModalOpen] = useState(false)
  const [btlYear, setBtlYear] = useState<number>(new Date().getFullYear())
  const [btlAmount, setBtlAmount] = useState<string>('')
  const [btlFile, setBtlFile] = useState<File | null>(null)
  const [btlUploading, setBtlUploading] = useState(false)
  const [btlError, setBtlError] = useState('')
  const btlFileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getTaxProfile(userId).then(p => { setProfile(p); setLoading(false) })
  }, [userId])

  const update = (changes: Partial<TaxProfile>) => {
    setProfile(prev => ({ ...prev, ...changes }))
    setSaved(false)
  }

  const handleSave = async () => {
    await saveTaxProfile(profile, userId)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const openStatusModal = () => {
    // Default target is the "other" status (or 'authorized' when none set)
    const nextDefault: 'exempt' | 'authorized' = profile.vatType === 'authorized' ? 'exempt' : 'authorized'
    setTargetVatType(nextDefault)
    setConversionDate(new Date().toISOString().slice(0, 10))
    setConversionFile(null)
    setConversionError('')
    setStatusModalOpen(true)
  }

  const handleStatusSave = async () => {
    if (!conversionDate) { setConversionError('יש לבחור תאריך תחילה'); return }
    const fromType = profile.vatType // may be undefined for initial setup
    const toType = targetVatType
    if (fromType === toType) { setConversionError('המעמד הנבחר זהה למעמד הנוכחי'); return }

    setConversionUploading(true)
    setConversionError('')
    try {
      let certificateDriveFileId: string | undefined
      let certificateDriveWebViewLink: string | undefined
      let certificateFileName: string | undefined

      if (conversionFile) {
        const token = await getAccessToken()
        if (!token) {
          setConversionError('לא מחובר ל-Google Drive — אנא התחבר בהגדרות כדי לצרף תעודה')
          setConversionUploading(false)
          return
        }
        const year = new Date(conversionDate).getFullYear()
        const result = await uploadTaxDocument(conversionFile, year)
        certificateDriveFileId = result.fileId
        certificateDriveWebViewLink = result.webViewLink
        certificateFileName = conversionFile.name
      }

      // Only record a conversion if this is a change (not initial setup).
      const nextProfile: TaxProfile = { ...profile, vatType: toType }
      if (fromType) {
        nextProfile.vatConversion = {
          from: fromType,
          to: toType,
          effectiveDate: conversionDate,
          certificateDriveFileId,
          certificateDriveWebViewLink,
          certificateFileName,
          recordedAt: new Date().toISOString(),
        }
      }
      await saveTaxProfile(nextProfile, userId)
      setProfile(nextProfile)
      setStatusModalOpen(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: any) {
      console.error('[TaxProfile] Status save failed:', err)
      setConversionError(err?.message || 'שמירת המעמד נכשלה')
    } finally {
      setConversionUploading(false)
    }
  }

  const openBtlModal = (editYear?: number) => {
    const existing = editYear != null ? (profile.btlNotices || []).find(n => n.year === editYear) : undefined
    setBtlYear(existing?.year ?? new Date().getFullYear())
    setBtlAmount(existing ? String(existing.amount) : (profile.btlAdvancePayment ? String(profile.btlAdvancePayment) : ''))
    setBtlFile(null)
    setBtlError('')
    setBtlModalOpen(true)
  }

  const handleBtlSave = async () => {
    const amountNum = Number(btlAmount)
    if (!btlYear || !Number.isFinite(btlYear)) { setBtlError('שנה לא תקינה'); return }
    if (!btlAmount || !Number.isFinite(amountNum) || amountNum < 0) { setBtlError('סכום חודשי לא תקין'); return }

    setBtlUploading(true)
    setBtlError('')
    try {
      const existing = (profile.btlNotices || []).find(n => n.year === btlYear)

      let driveFileId = existing?.driveFileId
      let driveWebViewLink = existing?.driveWebViewLink
      let fileName = existing?.fileName

      if (btlFile) {
        const token = await getAccessToken()
        if (!token) {
          setBtlError('לא מחובר ל-Google Drive — אנא התחבר בהגדרות כדי לצרף קובץ')
          setBtlUploading(false)
          return
        }
        const result = await uploadTaxDocument(btlFile, btlYear)
        driveFileId = result.fileId
        driveWebViewLink = result.webViewLink
        fileName = btlFile.name
      }

      // Run Claude extraction on the uploaded file (only when a new file was attached
      // this round — previously-uploaded files keep their stored schedule).
      let annualTotal = existing?.annualTotal
      let schedule = existing?.schedule
      let extractError: string | undefined
      if (btlFile) {
        try {
          const keyRow = await db.appSettings.where('key').equals('claudeApiKey').first()
          const claudeApiKey = keyRow?.value as string | undefined
          if (!claudeApiKey) {
            extractError = 'לא נמצא Claude API Key בהגדרות — לא ניתן לחלץ לוח תשלומים'
          } else {
            const base64 = await fileToBase64(btlFile)
            const res = await fetch('/api/extract-btl-notice', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ apiKey: claudeApiKey, fileBase64: base64, mimeType: btlFile.type }),
            })
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}))
              extractError = errData.error || `חילוץ נכשל (${res.status})`
            } else {
              const parsed = await res.json()
              if (Array.isArray(parsed.schedule)) {
                schedule = parsed.schedule.map((p: any) => ({
                  month: String(p.month),
                  amount: Number(p.amount),
                  dueDate: String(p.dueDate),
                  paymentUrl: p.paymentUrl ? String(p.paymentUrl) : undefined,
                })).filter((p: BtlPayment) => p.month && Number.isFinite(p.amount) && p.dueDate)
              }
              if (Number.isFinite(parsed.annualTotal)) {
                annualTotal = Number(parsed.annualTotal)
              }
            }
          }
        } catch (err: any) {
          extractError = err?.message || 'שגיאה בחילוץ לוח תשלומים'
        }
      }

      const notice: BtlNotice = {
        year: btlYear,
        amount: amountNum,
        driveFileId,
        driveWebViewLink,
        fileName,
        uploadedAt: new Date().toISOString(),
        annualTotal,
        schedule,
        extractError,
      }

      const rest = (profile.btlNotices || []).filter(n => n.year !== btlYear)
      const nextNotices = [...rest, notice].sort((a, b) => b.year - a.year)

      // Keep `btlAdvancePayment` in sync with the most-recent year's amount
      const latestAmount = nextNotices[0]?.amount ?? amountNum
      const nextProfile: TaxProfile = { ...profile, btlNotices: nextNotices, btlAdvancePayment: latestAmount }
      await saveTaxProfile(nextProfile, userId)
      setProfile(nextProfile)
      setBtlModalOpen(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: any) {
      console.error('[TaxProfile] BTL notice save failed:', err)
      setBtlError(err?.message || 'שמירת הודעת ב"ל נכשלה')
    } finally {
      setBtlUploading(false)
    }
  }

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(',')[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleBtlDelete = async (year: number) => {
    const nextNotices = (profile.btlNotices || []).filter(n => n.year !== year).sort((a, b) => b.year - a.year)
    const latestAmount = nextNotices[0]?.amount
    const nextProfile: TaxProfile = {
      ...profile,
      btlNotices: nextNotices,
      btlAdvancePayment: latestAmount ?? profile.btlAdvancePayment,
    }
    await saveTaxProfile(nextProfile, userId)
    setProfile(nextProfile)
  }

  if (loading) return null

  const vatTypeLabel = profile.vatType === 'exempt'
    ? 'עוסק פטור'
    : profile.vatType === 'authorized'
      ? 'עוסק מורשה'
      : 'טרם הוגדר'
  const documentLabel = profile.vatType === 'exempt'
    ? 'יופק: קבלה'
    : profile.vatType === 'authorized'
      ? 'יופק: חשבונית מס קבלה'
      : ''

  return (
    <section style={{
      padding: '1rem',
      border: '1px solid #e2e8f0',
      borderRadius: '0.75rem',
      background: '#f0f9ff',
      marginBottom: '1.5rem',
    }}>
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600 }}>
        הגדרות מס{memberLabel ? ` — ${memberLabel}` : ''}
      </h3>
      <p style={{ margin: '0 0 1rem', color: '#1e40af', fontSize: '0.85rem' }}>
        הגדרות אלו חלות על כל העסקים שלך
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* VAT type — display + change button (no radios) */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
            סוג עוסק (למע"מ)
          </label>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              padding: '0.3rem 0.6rem',
              borderRadius: '0.375rem',
              background: profile.vatType ? '#eff6ff' : '#f1f5f9',
              color: profile.vatType ? '#1e40af' : '#64748b',
              fontSize: '0.9rem',
              fontWeight: 600,
            }}>
              {vatTypeLabel}
            </span>
            {documentLabel && (
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{documentLabel}</span>
            )}
            <button
              type="button"
              onClick={openStatusModal}
              style={{
                padding: '0.35rem 0.85rem',
                fontSize: '0.8rem',
                background: '#eff6ff',
                color: '#1e40af',
                border: '1px solid #bfdbfe',
                borderRadius: '0.375rem',
                cursor: 'pointer',
              }}
            >
              {profile.vatType ? 'שינוי מעמד' : 'הגדר סוג עוסק'}
            </button>
          </div>
          {profile.vatConversion && (
            <div style={{
              marginTop: '0.5rem',
              padding: '0.5rem 0.75rem',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '0.5rem',
              fontSize: '0.8rem',
              color: '#334155',
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}>
              <span>
                הומר מ-{profile.vatConversion.from === 'exempt' ? 'עוסק פטור' : 'עוסק מורשה'}
                {' '}ל-{profile.vatConversion.to === 'authorized' ? 'עוסק מורשה' : 'עוסק פטור'}
                {' '}בתאריך {formatDisplayDate(profile.vatConversion.effectiveDate)}
              </span>
              {profile.vatConversion.certificateDriveWebViewLink && (
                <a
                  href={profile.vatConversion.certificateDriveWebViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#1e40af', textDecoration: 'underline' }}
                >
                  תעודה: {profile.vatConversion.certificateFileName || 'פתח'}
                </a>
              )}
            </div>
          )}
          {profile.vatType === 'authorized' && (
            <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem', flexWrap: 'wrap' }}>
              <span style={{ color: '#64748b' }}>תקופת דיווח מע״מ:</span>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="profileVatPeriod"
                  checked={profile.vatReportPeriod === 1}
                  onChange={() => update({ vatReportPeriod: 1 })}
                />
                חודשי
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="profileVatPeriod"
                  checked={(profile.vatReportPeriod ?? 2) === 2}
                  onChange={() => update({ vatReportPeriod: 2 })}
                />
                דו-חודשי
              </label>
            </div>
          )}
        </div>

        {/* Advance payments */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              מקדמות
            </label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div style={{
                flex: 1,
                padding: '0.5rem',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem',
                background: '#fff',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
              }}>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'stretch' }}>
                  <input
                    type="number"
                    value={profile.btlAdvancePayment || ''}
                    onChange={e => update({ btlAdvancePayment: e.target.value ? Number(e.target.value) : undefined })}
                    style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', fontSize: '0.9rem', direction: 'ltr' }}
                    placeholder="₪ בל״ל חודשי"
                    min={0}
                  />
                  <button
                    type="button"
                    onClick={() => openBtlModal()}
                    title="העלה הודעת בל״ל שנתית"
                    style={{
                      padding: '0 0.75rem',
                      fontSize: '0.85rem',
                      background: '#eff6ff',
                      color: '#1e40af',
                      border: '1px solid #bfdbfe',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    + הודעה
                  </button>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>ביטוח לאומי (סכום חודשי)</span>
                {profile.btlNotices && profile.btlNotices.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
                    {profile.btlNotices.map(n => (
                      <span
                        key={n.year}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          padding: '0.2rem 0.5rem',
                          fontSize: '0.75rem',
                          background: '#f1f5f9',
                          border: '1px solid #e2e8f0',
                          borderRadius: '0.375rem',
                        }}
                      >
                        {n.driveWebViewLink ? (
                          <a
                            href={n.driveWebViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#1e40af', textDecoration: 'underline' }}
                            title={n.fileName || ''}
                          >
                            {n.year}: {n.amount.toLocaleString('he-IL')} ₪
                          </a>
                        ) : (
                          <span>{n.year}: {n.amount.toLocaleString('he-IL')} ₪</span>
                        )}
                        <button
                          type="button"
                          onClick={() => openBtlModal(n.year)}
                          title="ערוך"
                          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0, fontSize: '0.75rem' }}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleBtlDelete(n.year)}
                          title="מחק"
                          style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 0, fontSize: '0.75rem' }}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {profile.btlNotices && profile.btlNotices.length > 0 && profile.btlNotices.map(n => (
                  n.schedule && n.schedule.length > 0 ? (
                    <details key={`sched-${n.year}`} style={{ marginTop: '0.4rem' }}>
                      <summary style={{ cursor: 'pointer', fontSize: '0.75rem', color: '#475569' }}>
                        לוח תשלומים {n.year} ({n.schedule.length} תשלומים
                        {n.annualTotal ? ` · סה"כ ${n.annualTotal.toLocaleString('he-IL')} ₪` : ''})
                      </summary>
                      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.3rem', fontSize: '0.75rem' }}>
                        <thead>
                          <tr style={{ color: '#475569', background: '#f8fafc' }}>
                            <th style={{ textAlign: 'right', padding: '0.25rem 0.4rem' }}>חודש</th>
                            <th style={{ textAlign: 'right', padding: '0.25rem 0.4rem' }}>תאריך לתשלום</th>
                            <th style={{ textAlign: 'left', padding: '0.25rem 0.4rem' }}>סכום</th>
                            <th style={{ textAlign: 'center', padding: '0.25rem 0.4rem' }}>תשלום</th>
                          </tr>
                        </thead>
                        <tbody>
                          {n.schedule.map(p => (
                            <tr key={`${n.year}-${p.month}`} style={{ borderTop: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '0.25rem 0.4rem' }}>{p.month}</td>
                              <td style={{ padding: '0.25rem 0.4rem' }}>{formatDisplayDate(p.dueDate)}</td>
                              <td style={{ padding: '0.25rem 0.4rem', textAlign: 'left', direction: 'ltr' }}>
                                {p.amount.toLocaleString('he-IL')} ₪
                              </td>
                              <td style={{ padding: '0.25rem 0.4rem', textAlign: 'center' }}>
                                {p.paymentUrl ? (
                                  <a href={p.paymentUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#1e40af', textDecoration: 'none' }}>
                                    💳 שלם
                                  </a>
                                ) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  ) : n.extractError ? (
                    <div key={`err-${n.year}`} style={{ marginTop: '0.4rem', fontSize: '0.7rem', color: '#b45309' }}>
                      {n.year}: חילוץ לוח תשלומים נכשל — {n.extractError}
                    </div>
                  ) : null
                ))}
              </div>
              <div style={{
                flex: 1,
                padding: '0.4rem 0.5rem',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem',
                background: '#fff',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.3rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', flex: 1 }}>מס הכנסה (%)</span>
                  <input
                    type="number"
                    value={profile.incomeTaxAdvancePercent ?? ''}
                    onChange={e => update({ incomeTaxAdvancePercent: e.target.value ? Number(e.target.value) : undefined })}
                    style={{ width: '5rem', padding: '0.3rem 0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.85rem', direction: 'ltr' }}
                    placeholder="%"
                    min={0}
                    max={100}
                    step={0.1}
                  />
                </div>
                {(profile.incomeTaxAdvancePercent ?? 0) > 0 && (
                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', fontSize: '0.8rem' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <input type="radio" name="profileAdvancePeriod" checked={(profile.incomeTaxAdvancePeriod ?? 1) === 1} onChange={() => update({ incomeTaxAdvancePeriod: 1 })} />
                      חודשי
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <input type="radio" name="profileAdvancePeriod" checked={profile.incomeTaxAdvancePeriod === 2} onChange={() => update({ incomeTaxAdvancePeriod: 2 })} />
                      דו-חודשי
                    </label>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderTop: '1px dashed #e2e8f0', paddingTop: '0.3rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', flex: 1 }}>תיאום מס</span>
                  <input
                    type="number"
                    value={profile.taxOrder ?? ''}
                    onChange={e => update({ taxOrder: e.target.value ? Number(e.target.value) : undefined })}
                    style={{ width: '3.5rem', padding: '0.3rem 0.5rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.85rem', direction: 'ltr' }}
                    placeholder="1"
                    min={1}
                    title="1 = ראשון (מדרגות נמוכות), 2 = ממשיך, וכו׳"
                  />
                </div>
              </div>
            </div>
        </div>

        {/* Save */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button onClick={() => void handleSave()} className="file-picker" style={{ padding: '0.5rem 1.5rem', fontSize: '0.875rem' }}>
            שמור
          </button>
          {saved && <span style={{ fontSize: '0.85rem', color: '#16a34a' }}>נשמר</span>}
        </div>
      </div>

      <Modal isOpen={statusModalOpen} onClose={() => setStatusModalOpen(false)} maxWidth="480px">
        <div className="modal-header">
          <h2>{profile.vatType ? 'שינוי מעמד' : 'הגדרת סוג עוסק'}</h2>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#475569' }}>
              מעמד נוכחי: <strong>{vatTypeLabel}</strong>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>
                מעמד חדש
              </label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="targetVatType"
                    checked={targetVatType === 'exempt'}
                    onChange={() => setTargetVatType('exempt')}
                  />
                  <span>עוסק פטור</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="targetVatType"
                    checked={targetVatType === 'authorized'}
                    onChange={() => setTargetVatType('authorized')}
                  />
                  <span>עוסק מורשה</span>
                </label>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>
                {profile.vatType ? 'תאריך תחילת המעמד החדש' : 'תאריך תחולה'}
              </label>
              <LocaleDateInput
                value={conversionDate}
                onChange={setConversionDate}
                style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', fontSize: '0.9rem', direction: 'ltr' }}
              />
              {profile.vatType && (
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  הכנסה לפני התאריך נשמרת תחת המעמד הקודם.
                </div>
              )}
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>
                תעודה מרשות המיסים {profile.vatType ? '' : '(אופציונלי)'}
              </label>
              <input
                ref={conversionFileInputRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={e => setConversionFile(e.target.files?.[0] || null)}
                style={{ fontSize: '0.85rem' }}
              />
              {conversionFile && (
                <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.25rem' }}>
                  {conversionFile.name}
                </div>
              )}
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                הקובץ יועלה ל-Google Drive תחת Tax Documents/{new Date(conversionDate || Date.now()).getFullYear()}.
              </div>
            </div>
            {conversionError && (
              <div style={{ padding: '0.5rem 0.75rem', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecdd3', borderRadius: '0.375rem', fontSize: '0.85rem' }}>
                {conversionError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setStatusModalOpen(false)} className="upload-another-btn" disabled={conversionUploading}>
                ביטול
              </button>
              <button
                onClick={() => void handleStatusSave()}
                className="file-picker"
                disabled={conversionUploading || !conversionDate}
              >
                {conversionUploading ? 'שומר…' : 'שמור'}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={btlModalOpen} onClose={() => setBtlModalOpen(false)} maxWidth="480px">
        <div className="modal-header">
          <h2>הודעת ביטוח לאומי שנתית</h2>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>
              הזן את השנה, הסכום החודשי שנקבע על ידי ביטוח לאומי, וצרף את ההודעה המקורית.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>שנה</label>
                <input
                  type="number"
                  value={btlYear}
                  onChange={e => setBtlYear(Number(e.target.value))}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', fontSize: '0.9rem', direction: 'ltr' }}
                  min={2000}
                  max={2100}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>סכום חודשי (₪)</label>
                <input
                  type="number"
                  value={btlAmount}
                  onChange={e => setBtlAmount(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', fontSize: '0.9rem', direction: 'ltr' }}
                  placeholder="6013"
                  min={0}
                />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>קובץ ההודעה</label>
              <input
                ref={btlFileInputRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={e => setBtlFile(e.target.files?.[0] || null)}
                style={{ fontSize: '0.85rem' }}
              />
              {btlFile && (
                <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.25rem' }}>{btlFile.name}</div>
              )}
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                הקובץ יועלה ל-Google Drive תחת Tax Documents/{btlYear}.
                {(profile.btlNotices || []).some(n => n.year === btlYear) && !btlFile && (
                  <> כרגע מוחלף קובץ קיים לשנה זו; השאר ריק כדי לעדכן רק את הסכום.</>
                )}
              </div>
            </div>
            {btlError && (
              <div style={{ padding: '0.5rem 0.75rem', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecdd3', borderRadius: '0.375rem', fontSize: '0.85rem' }}>
                {btlError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setBtlModalOpen(false)} className="upload-another-btn" disabled={btlUploading}>
                ביטול
              </button>
              <button
                onClick={() => void handleBtlSave()}
                className="file-picker"
                disabled={btlUploading || !btlYear || !btlAmount}
              >
                {btlUploading ? 'שומר…' : 'שמור'}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </section>
  )
}
