'use client'

import type { AgentTaskStatus } from '@/app/types/bot'

const STATUS_CONFIG: Record<AgentTaskStatus, { label: string; color: string; bg: string; border: string }> = {
  pending: { label: 'ממתין', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  in_progress: { label: 'בביצוע', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  done: { label: 'הושלם', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  failed: { label: 'נכשל', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
}

type Props = {
  status: AgentTaskStatus
  result?: string | null
}

export default function AgentStatusBadge({ status, result }: Props) {
  const config = STATUS_CONFIG[status]

  return (
    <span
      title={result || undefined}
      style={{
        fontSize: '0.65rem',
        fontWeight: 600,
        color: config.color,
        background: config.bg,
        border: `1px solid ${config.border}`,
        borderRadius: '0.25rem',
        padding: '0.05rem 0.35rem',
        whiteSpace: 'nowrap',
      }}
    >
      {config.label}
    </span>
  )
}
