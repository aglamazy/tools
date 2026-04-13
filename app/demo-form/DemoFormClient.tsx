'use client'

import { useState } from 'react'

interface FormField {
  id: string
  label: string
  type: string
  name: string
  placeholder?: string
  required: boolean
  options?: string[]
  accept?: string
}

interface FormStep {
  title: string
  fields: FormField[]
}

const steps: FormStep[] = [
  {
    title: 'פרטים אישיים',
    fields: [
      { id: 'full_name_he', label: 'שם מלא (עברית)', type: 'text', name: 'full_name_he', placeholder: 'ישראל ישראלי', required: true },
      { id: 'full_name_en', label: 'Full Name (English)', type: 'text', name: 'full_name_en', placeholder: 'Israel Israeli', required: true },
      { id: 'date_of_birth', label: 'תאריך לידה', type: 'date', name: 'date_of_birth', required: true },
      { id: 'phone', label: 'טלפון', type: 'tel', name: 'phone', placeholder: '050-1234567', required: true },
      { id: 'email', label: 'אימייל', type: 'email', name: 'email', placeholder: 'example@email.com', required: true },
      { id: 'instrument', label: 'כלי נגינה', type: 'text', name: 'instrument', placeholder: 'חליל צד', required: true },
    ],
  },
  {
    title: 'רקע מוזיקלי',
    fields: [
      { id: 'experience_level', label: 'רמת ניסיון', type: 'select', name: 'experience_level', required: true, options: ['', 'מתחיל', 'בינוני', 'מתקדם', 'מקצועי'] },
      { id: 'preferred_language', label: 'שפה מועדפת', type: 'select', name: 'preferred_language', required: false, options: ['', 'עברית', 'English', 'Deutsch', 'Francais'] },
      { id: 'short_bio', label: 'ביוגרפיה קצרה', type: 'textarea', name: 'short_bio', placeholder: 'ספר/י על עצמך בקצרה...', required: true },
      { id: 'musical_background', label: 'רקע מוזיקלי', type: 'textarea', name: 'musical_background', placeholder: 'תאר/י את ההשכלה המוזיקלית שלך, מורים, מוסדות...', required: true },
    ],
  },
  {
    title: 'מסמכים ושאלות נוספות',
    fields: [
      { id: 'why_applying', label: 'למה את/ה מגיש/ה מועמדות?', type: 'textarea', name: 'why_applying', placeholder: 'הסבר/י מדוע אתה מעוניין/ת להשתתף...', required: true },
      { id: 'cv_upload', label: 'קורות חיים (CV)', type: 'file', name: 'cv_upload', required: false, accept: '.pdf,.doc,.docx' },
      { id: 'recommendation_letter', label: 'מכתב המלצה', type: 'file', name: 'recommendation_letter', required: false, accept: '.pdf,.doc,.docx' },
      { id: 'profile_photo', label: 'תמונת פרופיל', type: 'file', name: 'profile_photo', required: false, accept: 'image/*' },
      { id: 'performance_video', label: 'סרטון ביצוע (MP4)', type: 'file', name: 'performance_video', required: false, accept: 'video/mp4' },
    ],
  },
]

export default function DemoFormClient() {
  const [currentStep, setCurrentStep] = useState(0)
  const step = steps[currentStep]

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 0.5rem 0.5rem', padding: '1.5rem' }}>
      {/* Step indicator */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', justifyContent: 'center' }}>
        {steps.map((s, i) => (
          <div key={i} style={{
            width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: i === currentStep ? '#3b82f6' : i < currentStep ? '#22c55e' : '#e2e8f0',
            color: i <= currentStep ? 'white' : '#64748b', fontWeight: 600, fontSize: '0.85rem',
          }}>
            {i + 1}
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: '1.1rem', color: '#1e293b', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
        {step.title}
      </h2>

      <form id="demo-audition-form" onSubmit={(e) => e.preventDefault()}>
        {step.fields.map((field) => (
          <div key={field.id} style={{ marginBottom: '1rem' }}>
            <label htmlFor={field.id} style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500, color: '#334155', fontSize: '0.9rem' }}>
              {field.label}
              {field.required && <span style={{ color: '#ef4444', marginRight: '0.25rem' }}>*</span>}
            </label>

            {field.type === 'textarea' ? (
              <textarea
                id={field.id}
                name={field.name}
                placeholder={field.placeholder}
                required={field.required}
                rows={4}
                style={{ width: '100%', padding: '0.625rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.875rem', resize: 'vertical', fontFamily: 'inherit' }}
              />
            ) : field.type === 'select' ? (
              <select
                id={field.id}
                name={field.name}
                required={field.required}
                style={{ width: '100%', padding: '0.625rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.875rem', background: 'white' }}
              >
                {field.options?.map((opt, i) => (
                  <option key={i} value={opt}>{opt || '— בחר —'}</option>
                ))}
              </select>
            ) : field.type === 'file' ? (
              <input
                id={field.id}
                type="file"
                name={field.name}
                accept={field.accept}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.875rem' }}
              />
            ) : (
              <input
                id={field.id}
                type={field.type}
                name={field.name}
                placeholder={field.placeholder}
                required={field.required}
                style={{ width: '100%', padding: '0.625rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.875rem' }}
              />
            )}
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem' }}>
          {currentStep > 0 && (
            <button
              type="button"
              onClick={() => setCurrentStep(currentStep - 1)}
              style={{ padding: '0.625rem 1.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', background: 'white', cursor: 'pointer', fontSize: '0.9rem' }}
            >
              הקודם
            </button>
          )}
          <div style={{ marginRight: 'auto' }} />
          {currentStep < steps.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrentStep(currentStep + 1)}
              style={{ padding: '0.625rem 1.5rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
            >
              הבא
            </button>
          ) : (
            <button
              type="submit"
              style={{ padding: '0.625rem 1.5rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
            >
              שלח טופס
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
