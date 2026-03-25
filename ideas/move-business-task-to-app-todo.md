# Unify All Tasks Under /app/todo

## Problem

Tasks are split between two places:
- `/app/todo` — personal Eisenhower board (Task model)
- `/app/business/:id/?tab=tasks` — recurring business tasks (BusinessTask model)

This creates confusion about where things live. New task types (scholarships, applications) don't fit neatly in either.

## Goal

One unified task system under `/app/todo` with filters. All task types in one place.

## Current Models

### Task (personal todo)
```ts
{
  title, completed, priority, quadrant,
  deadline, snoozedUntil, autoTaskId,
  delegatedTo, delegatedBy,
  botId, agentTaskId, agentStatus, agentResult
}
```

### BusinessTask (recurring business)
```ts
{
  businessId, title, description,
  recurrence, dueDay, dueMonth, reminderDaysBefore,
  priority, completed, archived,
  attachmentDriveFileId, attachmentDriveWebViewLink, attachmentFileName
}
```

## Proposed Unified Model

Common fields for all tasks, plus a typed `ext` (extensions) field for type-specific data.

```ts
interface Task {
  // --- Common fields (all task types) ---
  id?: number
  syncId?: string
  title: string
  description?: string
  completed: boolean
  priority: 'low' | 'medium' | 'high'
  quadrant: EisenhowerQuadrant
  deadline?: string              // ISO date
  snoozedUntil?: string
  createdAt: string
  updatedAt?: string

  // --- Categorization ---
  type: 'personal' | 'business' | 'scholarship' | 'auto'
  tags?: string[]                // free-form tags for filtering
  businessId?: number            // link to business (for business tasks)

  // --- Delegation ---
  delegatedTo?: string
  delegatedBy?: string
  botId?: string
  agentTaskId?: string
  agentStatus?: AgentTaskStatus
  agentResult?: string

  // --- Auto-task ---
  autoTaskId?: string

  // --- Attachments ---
  attachments?: TaskAttachment[]

  // --- Type-specific extensions ---
  ext?: TaskExtensions
}

interface TaskAttachment {
  driveFileId?: string
  driveWebViewLink?: string
  fileName?: string
  url?: string
}

type TaskExtensions = BusinessTaskExt | ScholarshipTaskExt

interface BusinessTaskExt {
  kind: 'business'
  recurrence: 'monthly' | 'weekly' | 'yearly' | 'once'
  dueDay?: number
  dueMonth?: number
  reminderDaysBefore?: number
}

interface ScholarshipTaskExt {
  kind: 'scholarship'
  links: { text: string; url: string }[]
  address?: string
  scholarshipTags?: string[]     // PO, JF, IO
  applicationStatus?: 'new' | 'reviewing' | 'applying' | 'sent' | 'rejected' | 'accepted'
  phone?: string
  notes?: string
}
```

## UI Changes

### Filters in /app/todo
- **Type filter**: All | Personal | Business | Scholarship
- **Business filter**: (when type=business) which business
- **Tag filter**: free-form tags
- **Status filter**: Active | Completed | Snoozed

### Views
- Eisenhower matrix (current default) — works for all types
- List view — better for scholarship triage (scan many items quickly)

### Business tab
- `/app/business/:id/?tab=tasks` becomes a filtered view of `/app/todo` (type=business, businessId=X)
- Or: redirect/link to `/app/todo?type=business&businessId=X`

## Migration

1. Add `type`, `tags`, `ext`, `description`, `attachments` fields to Task
2. Migrate existing BusinessTask rows → Task with `type: 'business'` and `ext: { kind: 'business', ... }`
3. BusinessTasksTab.tsx becomes a thin wrapper that filters the unified store
4. Eventually remove `businessTasks` table

## Phases

1. **Extend Task model** — add new fields, keep backward compatible
2. **Import scholarships** — first consumer of the new model
3. **Migrate business tasks** — move BusinessTask data into unified Task
4. **Unify UI** — filters, list view, business tab as filtered view
5. **Remove BusinessTask** — drop old table and components
