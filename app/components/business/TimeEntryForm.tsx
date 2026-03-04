'use client'

import React, { useMemo } from 'react'
import FormModal, { FormField, inputStyle } from '../FormModal'
import { LocaleDateInput, LocaleTimeInput } from '../LocaleInputs'
import type { Project, HarvestTask } from '@/app/db/financeDB'

function calculateDuration(startTime: string, endTime: string, endNextDay: boolean): number {
  if (!startTime || !endTime) return 0
  const [startH, startM] = startTime.split(':').map(Number)
  const [endH, endM] = endTime.split(':').map(Number)
  const startMinutes = startH * 60 + startM
  let endMinutes = endH * 60 + endM
  if (endNextDay) {
    endMinutes += 24 * 60
  }
  return (endMinutes - startMinutes) / 60
}

function formatDuration(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h}:${m.toString().padStart(2, '0')}`
}

export type TimeEntryFormData = {
  projectId: number | null
  taskId: number | null
  date: string
  startTime: string
  endTime: string
  endNextDay: boolean
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
  const hours = useMemo(
    () => calculateDuration(data.startTime, data.endTime, data.endNextDay),
    [data.startTime, data.endTime, data.endNextDay]
  )

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
        <LocaleDateInput
          value={data.date}
          onChange={(date) => onChange({ ...data, date })}
          style={inputStyle}
        />
      </FormField>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
        <FormField label="שעת התחלה">
          <LocaleTimeInput
            value={data.startTime}
            onChange={(startTime) => onChange({ ...data, startTime })}
            style={inputStyle}
          />
        </FormField>

        <FormField label="שעת סיום">
          <LocaleTimeInput
            value={data.endTime}
            onChange={(endTime) => onChange({ ...data, endTime })}
            style={inputStyle}
          />
        </FormField>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
          <button
            type="button"
            onClick={() => onChange({ ...data, endNextDay: !data.endNextDay })}
            style={{
              padding: '0.4rem 0.5rem',
              background: data.endNextDay ? '#3b82f6' : '#e2e8f0',
              border: 'none',
              borderRadius: '0.375rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: data.endNextDay ? '#fff' : '#64748b',
              cursor: 'pointer',
            }}
            title={data.endNextDay ? 'סיום ביום הבא' : 'סיום באותו יום'}
          >
            {data.endNextDay ? '+1' : '+0'}
          </button>
          {hours > 0 && hours <= 25 && (
            <span style={{
              fontSize: '0.85rem',
              fontWeight: 500,
              color: data.endNextDay ? '#1d4ed8' : '#64748b',
            }}>
              {formatDuration(hours)}
            </span>
          )}
          {hours <= 0 && data.startTime && data.endTime && (
            <span style={{ fontSize: '0.8rem', color: '#dc2626' }}>שעת סיום לפני התחלה</span>
          )}
          {hours > 25 && (
            <span style={{ fontSize: '0.8rem', color: '#dc2626' }}>משך זמן חריג ({formatDuration(hours)})</span>
          )}
        </div>
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
