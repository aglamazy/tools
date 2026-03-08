'use client'

import React from 'react'
import type { Project, HarvestTask } from '@/app/db/financeDB'
import type { ActiveTimer } from '@/app/stores/timerStore'
import { formatTime } from '@/app/lib/dateUtils'

type TimerSectionProps = {
  projects: Project[]
  tasks: HarvestTask[]
  allTasks: HarvestTask[]
  selectedProjectId: number | null
  selectedTaskId: number | null
  activeTimer: ActiveTimer | null
  elapsedSeconds: number
  showAllTasks: boolean
  recentTasksLimit: number
  onProjectChange: (id: number) => void
  onTaskChange: (value: string) => void
  onShowAllTasks: () => void
  onAddTask: () => void
  onStart: () => void
  onStop: () => void
  onManualEntry: () => void
}

export default function TimerSection({
  projects, tasks, allTasks, selectedProjectId, selectedTaskId,
  activeTimer, elapsedSeconds, showAllTasks, recentTasksLimit,
  onProjectChange, onTaskChange, onShowAllTasks, onAddTask,
  onStart, onStop, onManualEntry,
}: TimerSectionProps) {
  return (
    <div style={{
      background: activeTimer ? '#ecfdf5' : '#f8fafc',
      border: `1px solid ${activeTimer ? '#6ee7b7' : '#e2e8f0'}`,
      borderRadius: '0.75rem',
      padding: '1.5rem',
      marginBottom: '1.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <select
          value={selectedProjectId || ''}
          onChange={(e) => onProjectChange(Number(e.target.value))}
          disabled={!!activeTimer}
          style={{
            padding: '0.5rem',
            borderRadius: '0.375rem',
            border: '1px solid #d1d5db',
            fontSize: '0.95rem',
            minWidth: '150px',
          }}
        >
          <option value="">בחר פרויקט</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select
          value={selectedTaskId || ''}
          onChange={(e) => {
            const value = e.target.value
            if (value === '__show_more__') {
              onShowAllTasks()
            } else {
              onTaskChange(value)
            }
          }}
          disabled={!!activeTimer || !selectedProjectId}
          style={{
            padding: '0.5rem',
            borderRadius: '0.375rem',
            border: '1px solid #d1d5db',
            fontSize: '0.95rem',
            minWidth: '150px',
          }}
        >
          <option value="">בחר משימה</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
          {!showAllTasks && allTasks.length > recentTasksLimit && (
            <option value="__show_more__" style={{ fontStyle: 'italic', color: '#6b7280' }}>
              ··· הצג עוד {allTasks.length - recentTasksLimit} משימות
            </option>
          )}
        </select>

        <button
          onClick={onAddTask}
          disabled={!selectedProjectId || !!activeTimer}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: selectedProjectId && !activeTimer ? 'pointer' : 'not-allowed',
            opacity: selectedProjectId && !activeTimer ? 1 : 0.5,
          }}
        >
          + הוסף משימה
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <div style={{
          fontSize: '2.5rem',
          fontFamily: 'monospace',
          fontWeight: 600,
          color: activeTimer ? '#059669' : '#64748b',
        }}>
          {formatTime(elapsedSeconds)}
        </div>

        {activeTimer ? (
          <button
            onClick={() => void onStop()}
            style={{
              padding: '0.75rem 2rem',
              fontSize: '1rem',
              fontWeight: 600,
              background: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
            }}
          >
            עצור
          </button>
        ) : (
          <button
            onClick={() => void onStart()}
            disabled={!selectedTaskId}
            style={{
              padding: '0.75rem 2rem',
              fontSize: '1rem',
              fontWeight: 600,
              background: selectedTaskId ? '#059669' : '#9ca3af',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: selectedTaskId ? 'pointer' : 'not-allowed',
            }}
          >
            התחל
          </button>
        )}

        <button
          onClick={onManualEntry}
          disabled={!!activeTimer}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '0.9rem',
            background: '#f1f5f9',
            color: '#475569',
            border: '1px solid #cbd5e1',
            borderRadius: '0.5rem',
            cursor: activeTimer ? 'not-allowed' : 'pointer',
            opacity: activeTimer ? 0.5 : 1,
          }}
        >
          + הוספה ידנית
        </button>
      </div>

      {projects.length === 0 && (
        <p style={{ color: '#64748b', marginTop: '1rem', fontSize: '0.9rem' }}>
          אין פרויקטים. צור פרויקט בלשונית הגדרות.
        </p>
      )}
      {selectedProjectId && tasks.length === 0 && (
        <p style={{ color: '#64748b', marginTop: '1rem', fontSize: '0.9rem' }}>
          אין משימות בפרויקט זה. צור משימה בלשונית הגדרות.
        </p>
      )}
    </div>
  )
}
