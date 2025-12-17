'use client'

import React from 'react'
import FormModal, { FormField, inputStyle } from '../FormModal'
import type { Project, HarvestTask } from '@/app/db/financeDB'

export type TimeEntryFormData = {
  projectId: number | null
  taskId: number | null
  date: string
  startTime: string
  endTime: string
}

type TimeEntryFormProps = {
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
  title: string
  data: TimeEntryFormData
  onChange: (data: TimeEntryFormData) => void
  projects: Project[]
  tasks: HarvestTask[]
  onProjectChange?: (projectId: number) => void
  showProjectTask?: boolean // false for edit mode (read-only display)
  projectName?: string
  taskName?: string
}

export default function TimeEntryForm({
  isOpen,
  onClose,
  onSave,
  onDelete,
  title,
  data,
  onChange,
  projects,
  tasks,
  onProjectChange,
  showProjectTask = true,
  projectName,
  taskName,
}: TimeEntryFormProps) {
  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      onSave={onSave}
      title={title}
    >
      {showProjectTask ? (
        <>
          <FormField label="פרויקט">
            <select
              value={data.projectId || ''}
              onChange={(e) => {
                const id = Number(e.target.value)
                onChange({ ...data, projectId: id, taskId: null })
                onProjectChange?.(id)
              }}
              style={inputStyle}
            >
              <option value="">בחר פרויקט</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </FormField>

          <FormField label="משימה">
            <select
              value={data.taskId || ''}
              onChange={(e) => onChange({ ...data, taskId: Number(e.target.value) })}
              disabled={!data.projectId}
              style={inputStyle}
            >
              <option value="">בחר משימה</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </FormField>
        </>
      ) : (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem' }}>
          <span style={{ fontWeight: 500 }}>{projectName}</span>
          <span style={{ color: '#64748b', margin: '0 0.5rem' }}>›</span>
          <span>{taskName}</span>
        </div>
      )}

      <FormField label="תאריך">
        <input
          type="date"
          value={data.date}
          onChange={(e) => onChange({ ...data, date: e.target.value })}
          style={inputStyle}
        />
      </FormField>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <FormField label="שעת התחלה">
          <input
            type="time"
            value={data.startTime}
            onChange={(e) => onChange({ ...data, startTime: e.target.value })}
            style={inputStyle}
          />
        </FormField>

        <FormField label="שעת סיום">
          <input
            type="time"
            value={data.endTime}
            onChange={(e) => onChange({ ...data, endTime: e.target.value })}
            style={inputStyle}
          />
        </FormField>
      </div>

      {onDelete && (
        <button
          onClick={onDelete}
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.375rem',
            color: '#dc2626',
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          מחק רישום
        </button>
      )}
    </FormModal>
  )
}
