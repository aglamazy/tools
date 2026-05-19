# Consolidate Time Tracking with Todo

## Problem

Time tracking and tasks live in two disconnected places:
- **Eisenhower matrix** (`/app/todo`) — personal/admin tasks, no timer
- **Business time tracking** (`/app/business/:id/?tab=time`) — Harvest-style timer tied to a specific business, with project/task dropdowns and weekly view

To start tracking time on something from the todo board, you have to navigate to the business, switch to the time tab, pick the right project/task, and hit start. The two systems don't talk to each other.

## Current Architecture

### Time Tracking (per business)
- `Project` — belongs to a business, has name, color, hourly rate
- `HarvestTask` — belongs to a project, has name, hourly rate, assignee
- `TimeEntry` — belongs to a HarvestTask, has date, startTime, endTime, hours
- UI: timer widget in business tab, daily/weekly/monthly views

### Todo (global)
- `Task` — Eisenhower quadrant, priority, deadline, delegation, snooze
- No concept of time tracking or billing

## Options

### Option A: Timer button on todo tasks
Add a small timer button on each task card in the Eisenhower matrix.
- Clicking it opens a quick picker: which business/project to log time to (or a default)
- Starts the timer — a small floating indicator shows elapsed time globally
- Stopping creates a `TimeEntry` linked to the chosen project/task
- **Pros**: Minimal change, both systems stay separate but connected at the action level
- **Cons**: Still two mental models, just a shortcut between them

### Option B: Unified task + time model
After the task unification (see `move-business-task-to-app-todo.md`), every task — personal or business — lives in `/app/todo`. Business tasks already have a `businessId`. Add time tracking fields directly:
- `Task` gets optional `projectId` / `harvestTaskId` links
- Timer state is global (one active timer at a time), stored in a lightweight store
- The Eisenhower board shows a running timer indicator on the active task
- Time entries still link to HarvestTask for billing, but the *start/stop* action happens from the unified task board
- **Pros**: One place for all work, natural workflow
- **Cons**: Depends on task unification shipping first

### Option C: Global floating timer
A persistent mini-widget (bottom corner, like the chat bubble) visible on all pages.
- Can be started from anywhere — todo board, business page, or the widget itself
- Pre-fills task name when started from a todo card
- Independent of task unification
- **Pros**: Works immediately, no architectural dependency
- **Cons**: Doesn't solve the two-systems problem, just adds a third surface

## Recommendation

**Start with Option A** (timer button on task cards) as a quick win. It's independent and immediately useful. Then evolve toward **Option B** as part of the task unification effort — once business tasks live in the todo board, time tracking follows naturally.

A global running-timer indicator (small bar or badge) should be added regardless of which option, so you always know if a timer is running.

## Implementation Sketch (Option A)

1. **Timer store** (`app/stores/timerStore.ts`)
   - `activeTimer: { taskId, harvestTaskId, projectId, businessId, startedAt } | null`
   - `startTimer(taskId, harvestTaskId, projectId, businessId)`
   - `stopTimer()` — creates TimeEntry, clears state
   - Persist to localStorage so it survives page refreshes

2. **Timer button on TaskCard**
   - Show next to snooze/delegate/delete buttons
   - If no timer running: show play icon, click opens project/task picker then starts
   - If this task's timer is running: show stop icon + elapsed time
   - If another task's timer is running: show play icon but stopping the other first

3. **Global timer indicator**
   - Small floating bar at top or bottom of screen
   - Shows: task name, elapsed time, stop button
   - Visible on all pages

4. **Project/task picker**
   - Quick modal or dropdown when starting timer from a todo task
   - Remember last-used project per task (or per subject) for fast re-start
