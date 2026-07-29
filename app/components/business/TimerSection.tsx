'use client'

import React, { useState, useRef, useEffect } from 'react'
import type { Project, HarvestTask } from '@/app/db/financeDB'
import type { ActiveTimer } from '@/app/stores/timerStore'
import { formatTime } from '@/app/lib/dateUtils'

type TimerSectionProps = {
  projects: Project[]
  tasks: HarvestTask[]
  allTasks: HarvestTask[]
  selectedProjectId: string | null
  selectedTaskId: string | null
  activeTimer: ActiveTimer | null
  elapsedSeconds: number
  showAllTasks: boolean
  recentTasksLimit: number
  onProjectChange: (id: string) => void
  onTaskChange: (value: string) => void
  onShowAllTasks: () => void
  onAddTask: () => void
  onStart: () => void
  onStop: () => void
  onManualEntry: () => void
}

function Dropdown({ value, placeholder, options, disabled, onChange, showMore }: {
  value: string | null
  placeholder: string
  options: { id: string; name: string }[]
  disabled?: boolean
  onChange: (value: string) => void
  showMore?: { count: number; onShow: () => void }
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = options.find(o => o.id === value)

  return (
    <div ref={ref} style={{ position: 'relative', flex: '1 1 0', minWidth: 0 }}>
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '0.5rem 1.75rem 0.5rem 0.5rem',
          borderRadius: '0.375rem',
          border: '1px solid #d1d5db',
          fontSize: '0.85rem',
          background: disabled ? '#f1f5f9' : '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'right',
          direction: 'rtl',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: selected ? '#1e293b' : '#9ca3af',
          position: 'relative',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {selected?.name || placeholder}
        <span style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.7rem', color: '#9ca3af', pointerEvents: 'none' }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          left: 0,
          zIndex: 50,
          background: '#fff',
          border: '1px solid #d1d5db',
          borderRadius: '0.375rem',
          marginTop: '0.25rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          maxHeight: '200px',
          overflowY: 'auto',
        }}>
          {options.map(o => (
            <div
              key={o.id}
              onClick={() => { onChange(String(o.id)); setOpen(false) }}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.85rem',
                cursor: 'pointer',
                background: o.id === value ? '#eff6ff' : 'transparent',
                color: o.id === value ? '#1e40af' : '#1e293b',
                fontWeight: o.id === value ? 600 : 400,
                direction: 'rtl',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = o.id === value ? '#eff6ff' : '#f8fafc')}
              onMouseLeave={e => (e.currentTarget.style.background = o.id === value ? '#eff6ff' : 'transparent')}
            >
              {o.name}
            </div>
          ))}
          {showMore && (
            <div
              onClick={() => { showMore.onShow(); }}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.8rem',
                cursor: 'pointer',
                color: '#6b7280',
                fontStyle: 'italic',
                direction: 'rtl',
                borderTop: '1px solid #f1f5f9',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              עוד {showMore.count} משימות...
            </div>
          )}
        </div>
      )}
    </div>
  )
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
      padding: '1rem',
      marginBottom: '1.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <Dropdown
          value={selectedProjectId}
          placeholder="פרויקט"
          options={projects.map(p => ({ id: p.syncId!, name: p.name }))}
          disabled={!!activeTimer}
          onChange={onProjectChange}
        />
        <Dropdown
          value={selectedTaskId}
          placeholder="משימה"
          options={tasks.map(t => ({ id: t.syncId!, name: t.name }))}
          disabled={!!activeTimer || !selectedProjectId}
          onChange={onTaskChange}
          showMore={!showAllTasks && allTasks.length > recentTasksLimit ? {
            count: allTasks.length - recentTasksLimit,
            onShow: onShowAllTasks,
          } : undefined}
        />
        <button
          onClick={onAddTask}
          disabled={!selectedProjectId || !!activeTimer}
          title="הוסף משימה"
          style={{
            padding: '0.5rem',
            fontSize: '1.1rem',
            lineHeight: 1,
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: selectedProjectId && !activeTimer ? 'pointer' : 'not-allowed',
            opacity: selectedProjectId && !activeTimer ? 1 : 0.5,
            flexShrink: 0,
            width: '2rem',
            height: '2rem',
          }}
        >
          +
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{
          fontSize: '2.25rem',
          fontFamily: 'monospace',
          fontWeight: 600,
          color: activeTimer ? '#059669' : '#64748b',
        }}>
          {formatTime(elapsedSeconds)}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginRight: 'auto' }}>
          {activeTimer ? (
            <button
              onClick={() => void onStop()}
              style={{
                padding: '0.6rem 1.5rem',
                fontSize: '0.9rem',
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
                padding: '0.6rem 1.5rem',
                fontSize: '0.9rem',
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
              padding: '0.6rem 1rem',
              fontSize: '0.8rem',
              background: '#f1f5f9',
              color: '#475569',
              border: '1px solid #cbd5e1',
              borderRadius: '0.5rem',
              cursor: activeTimer ? 'not-allowed' : 'pointer',
              opacity: activeTimer ? 0.5 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            + ידנית
          </button>
        </div>
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
