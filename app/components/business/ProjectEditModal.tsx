'use client'

import React, { useState, useEffect } from 'react'
import type { Project } from '@/app/db/financeDB'
import FormModal, { FormField, inputStyle } from '@/app/components/FormModal'

type ProjectEditModalProps = {
  project: Project | null
  isNew?: boolean
  onClose: () => void
  onSave: (project: Project) => void
}

export default function ProjectEditModal({ project, isNew, onClose, onSave }: ProjectEditModalProps) {
  const [editing, setEditing] = useState<Project | null>(null)

  useEffect(() => {
    setEditing(project ? { ...project } : null)
  }, [project])

  if (!editing) return null

  return (
    <FormModal
      isOpen={!!editing}
      onClose={onClose}
      onSave={() => onSave(editing)}
      title={isNew ? 'פרויקט חדש' : 'עריכת פרויקט'}
    >
      <FormField label="שם">
        <input
          type="text"
          value={editing.name}
          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          autoFocus
          style={inputStyle}
        />
      </FormField>

      <FormField label="צבע">
        <input
          type="color"
          value={editing.color || '#3b82f6'}
          onChange={(e) => setEditing({ ...editing, color: e.target.value })}
          style={{
            width: '60px',
            height: '40px',
            padding: '0',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            cursor: 'pointer',
          }}
        />
      </FormField>

      <FormField label="תעריף שעתי ברירת מחדל">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="number"
            value={editing.defaultHourlyRate || ''}
            onChange={(e) => setEditing({ ...editing, defaultHourlyRate: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="0"
            style={{ ...inputStyle, flex: 1 }}
          />
          <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>₪ / שעה</span>
        </div>
      </FormField>

      <FormField label="אימייל">
        <input
          type="email"
          value={editing.contactEmail || ''}
          onChange={(e) => setEditing({ ...editing, contactEmail: e.target.value })}
          placeholder="email@example.com"
          style={{ ...inputStyle, direction: 'ltr' }}
        />
      </FormField>

      <FormField label="ח.פ">
        <input
          type="text"
          value={editing.contactBusinessID || ''}
          onChange={(e) => setEditing({ ...editing, contactBusinessID: e.target.value })}
          placeholder=""
          style={{ ...inputStyle, direction: 'ltr' }}
        />
      </FormField>

      <FormField label="טלפון">
        <input
          type="tel"
          value={editing.contactPhone || ''}
          onChange={(e) => setEditing({ ...editing, contactPhone: e.target.value })}
          placeholder="050-0000000"
          style={{ ...inputStyle, direction: 'ltr' }}
        />
      </FormField>

      <FormField label="מזהה חיוב חיצוני">
        <input
          type="text"
          value={editing.externalBillingId || ''}
          onChange={(e) => setEditing({ ...editing, externalBillingId: e.target.value })}
          placeholder=""
          style={{ ...inputStyle, direction: 'ltr' }}
        />
      </FormField>
    </FormModal>
  )
}
