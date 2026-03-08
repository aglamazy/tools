'use client'

import React from 'react'
import FormModal, { FormField, inputStyle } from '../FormModal'

export type EditingTask = {
  projectId: number
  name: string
  hourlyRate?: number
}

type AddTaskModalProps = {
  editingTask: EditingTask | null
  onClose: () => void
  onSave: () => void
  onChange: (task: EditingTask) => void
}

export default function AddTaskModal({ editingTask, onClose, onSave, onChange }: AddTaskModalProps) {
  if (!editingTask) return null

  return (
    <FormModal
      isOpen={!!editingTask}
      onClose={onClose}
      onSave={onSave}
      title="משימה חדשה"
    >
      <FormField label="שם">
        <input
          type="text"
          value={editingTask.name}
          onChange={(e) => onChange({ ...editingTask, name: e.target.value })}
          placeholder="לדוגמה: פיתוח, עיצוב, ניהול"
          autoFocus
          style={inputStyle}
        />
      </FormField>

      <FormField label="תעריף שעתי (אופציונלי)">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="number"
            value={editingTask.hourlyRate || ''}
            onChange={(e) => onChange({ ...editingTask, hourlyRate: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="0"
            style={{ ...inputStyle, flex: 1 }}
          />
          <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>₪ / שעה</span>
        </div>
      </FormField>
    </FormModal>
  )
}
