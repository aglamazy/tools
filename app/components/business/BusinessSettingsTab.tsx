'use client'

import React, { useEffect, useState } from 'react'
import { projectStore } from '@/app/stores/projectStore'
import { harvestTaskStore } from '@/app/stores/harvestTaskStore'
import { businessStore } from '@/app/stores/businessStore'
import type { Project, HarvestTask } from '@/app/db/financeDB'
import { listShares, type BusinessShare } from '@/app/services/businessShareService'
import { getUser } from '@/app/stores/authStore'
import { subscribeToAuthState } from '@/app/services/firebaseAuthService'
import FormModal, { FormField, inputStyle } from '../FormModal'
import ProjectEditModal from './ProjectEditModal'

type BusinessSettingsTabProps = {
  businessId: number
}

// Distinct color palette for projects
const PROJECT_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#84cc16', // lime
  '#a855f7', // violet
]

function getNextProjectColor(existingColors: (string | undefined)[]): string {
  const usedColors = new Set(existingColors.filter(Boolean).map(c => c?.toLowerCase()))
  // Find first unused color
  for (const color of PROJECT_COLORS) {
    if (!usedColors.has(color.toLowerCase())) {
      return color
    }
  }
  // All colors used, cycle back with the least used
  return PROJECT_COLORS[existingColors.length % PROJECT_COLORS.length]
}

export default function BusinessSettingsTab({ businessId }: BusinessSettingsTabProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Record<number, HarvestTask[]>>({})
  const [expandedProject, setExpandedProject] = useState<number | null>(null)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [editingTask, setEditingTask] = useState<HarvestTask | null>(null)
  const [isNewProject, setIsNewProject] = useState(false)
  const [isNewTask, setIsNewTask] = useState(false)
  const [newTaskProjectId, setNewTaskProjectId] = useState<number | null>(null)
  const [teamMembers, setTeamMembers] = useState<{ email: string }[]>([])

  useEffect(() => {
    void loadProjects()
    const unsub = subscribeToAuthState((user) => {
      if (user) {
        void loadTeamMembers()
        unsub()
      }
    })

    // Refresh when shared sync delivers new data
    const handleRefresh = () => {
      void loadProjects()
      // Reload tasks for expanded project
      if (expandedProject) void loadTasks(expandedProject)
    }
    window.addEventListener('shared-data-updated', handleRefresh)

    return () => {
      unsub()
      window.removeEventListener('shared-data-updated', handleRefresh)
    }
  }, [businessId, expandedProject])

  const loadProjects = async () => {
    const p = await projectStore.getByBusinessId(businessId)
    setProjects(p.sort((a, b) => a.name.localeCompare(b.name, 'he')))
  }

  const loadTasks = async (projectId: number) => {
    const t = await harvestTaskStore.getByProjectId(projectId)
    setTasks((prev) => ({ ...prev, [projectId]: t.sort((a, b) => a.name.localeCompare(b.name, 'he')) }))
  }

  const loadTeamMembers = async () => {
    const business = await businessStore.getById(businessId)
    if (!business?.syncId) return
    const user = getUser()
    const members: { email: string }[] = []
    if (user?.email) members.push({ email: user.email })
    try {
      const result = await listShares()
      if (result.success) {
        const bizShares = (result.ownedShares || []).filter(
          (s: BusinessShare) => s.businessSyncId === business.syncId && s.status === 'active',
        )
        for (const share of bizShares) {
          if (!members.some(m => m.email === share.sharedWithEmail)) {
            members.push({ email: share.sharedWithEmail })
          }
        }
        // If I'm a sharee, add owner info from share
        if (business.sharedWithMe) {
          // My email is already added above; owner email isn't easily available here
          // but the shared data will include tasks assigned to me
        }
      }
    } catch { /* no shares */ }
    setTeamMembers(members)
  }

  const handleExpandProject = async (projectId: number) => {
    if (expandedProject === projectId) {
      setExpandedProject(null)
    } else {
      setExpandedProject(projectId)
      if (!tasks[projectId]) {
        await loadTasks(projectId)
      }
    }
  }

  const handleAddProject = () => {
    const existingColors = projects.map(p => p.color)
    const nextColor = getNextProjectColor(existingColors)
    setEditingProject({
      businessId,
      name: '',
      color: nextColor,
      archived: false,
      createdAt: '',
      updatedAt: '',
    })
    setIsNewProject(true)
  }

  const handleEditProject = (project: Project) => {
    setEditingProject({ ...project })
    setIsNewProject(false)
  }

  const handleSaveProject = async (project: Project) => {
    if (!project.name.trim()) return

    if (isNewProject) {
      await projectStore.add({
        businessId: project.businessId,
        name: project.name.trim(),
        color: project.color,
        defaultHourlyRate: project.defaultHourlyRate,
        contactEmail: project.contactEmail,
        contactBusinessID: project.contactBusinessID,
        contactPhone: project.contactPhone,
      })
    } else {
      await projectStore.update(project.id!, {
        name: project.name.trim(),
        color: project.color,
        defaultHourlyRate: project.defaultHourlyRate,
        contactEmail: project.contactEmail,
        contactBusinessID: project.contactBusinessID,
        contactPhone: project.contactPhone,
      })
    }

    setEditingProject(null)
    await loadProjects()
  }

  const handleArchiveProject = async (project: Project) => {
    await projectStore.archive(project.id!)
    await loadProjects()
  }

  const handleAddTask = (projectId: number) => {
    const project = projects.find((p) => p.id === projectId)
    setEditingTask({
      projectId,
      name: '',
      hourlyRate: project?.defaultHourlyRate,
      archived: false,
      createdAt: '',
      updatedAt: '',
    })
    setNewTaskProjectId(projectId)
    setIsNewTask(true)
  }

  const handleEditTask = (task: HarvestTask) => {
    setEditingTask({ ...task })
    setIsNewTask(false)
  }

  const handleSaveTask = async () => {
    if (!editingTask || !editingTask.name.trim()) return

    if (isNewTask) {
      await harvestTaskStore.add({
        projectId: editingTask.projectId,
        name: editingTask.name.trim(),
        hourlyRate: editingTask.hourlyRate,
        assignedTo: editingTask.assignedTo || undefined,
      })
    } else {
      await harvestTaskStore.update(editingTask.id!, {
        name: editingTask.name.trim(),
        hourlyRate: editingTask.hourlyRate,
        assignedTo: editingTask.assignedTo || undefined,
      })
    }

    setEditingTask(null)
    await loadTasks(editingTask.projectId)
  }

  const handleArchiveTask = async (task: HarvestTask) => {
    await harvestTaskStore.archive(task.id!)
    await loadTasks(task.projectId)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>פרויקטים</h3>
        <button
          onClick={handleAddProject}
          className="file-picker"
        >
          + פרויקט חדש
        </button>
      </div>

      {projects.length === 0 ? (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#64748b',
          background: '#f8fafc',
          borderRadius: '0.75rem',
          border: '1px dashed #cbd5e1',
        }}>
          <p>אין פרויקטים. צור פרויקט חדש כדי להתחיל לתעד זמן.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {projects.map((project) => (
            <div key={project.id}>
              {/* Project Row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  background: project.archived ? '#f1f5f9' : '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: expandedProject === project.id ? '0.5rem 0.5rem 0 0' : '0.5rem',
                  opacity: project.archived ? 0.6 : 1,
                }}
              >
                <button
                  onClick={() => void handleExpandProject(project.id!)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    padding: '0.25rem',
                  }}
                >
                  {expandedProject === project.id ? '▼' : '◀'}
                </button>

                <span style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: project.color || '#3b82f6',
                }} />

                <span style={{ flex: 1, fontWeight: 500 }}>{project.name}</span>

                {project.defaultHourlyRate && (
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    {project.defaultHourlyRate}₪/שעה
                  </span>
                )}

                {project.archived && (
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>בארכיון</span>
                )}

                <button
                  onClick={() => handleEditProject(project)}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.8rem',
                    background: 'transparent',
                    border: '1px solid #cbd5e1',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                  }}
                >
                  ערוך
                </button>

                {!project.archived && (
                  <button
                    onClick={() => void handleArchiveProject(project)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.8rem',
                      background: 'transparent',
                      border: '1px solid #fecaca',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      color: '#dc2626',
                    }}
                  >
                    ארכיון
                  </button>
                )}
              </div>

              {/* Tasks List */}
              {expandedProject === project.id && (
                <div style={{
                  border: '1px solid #e2e8f0',
                  borderTop: 'none',
                  borderRadius: '0 0 0.5rem 0.5rem',
                  padding: '0.75rem',
                  background: '#fff',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>משימות</span>
                    <button
                      onClick={() => handleAddTask(project.id!)}
                      style={{
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.8rem',
                        background: '#f0fdf4',
                        border: '1px solid #86efac',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        color: '#166534',
                      }}
                    >
                      + משימה
                    </button>
                  </div>

                  {tasks[project.id!]?.length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {tasks[project.id!].map((task) => (
                        <div
                          key={task.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 0.75rem',
                            background: task.archived ? '#f8fafc' : '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '0.375rem',
                            opacity: task.archived ? 0.6 : 1,
                          }}
                        >
                          <span style={{ flex: 1 }}>{task.name}</span>

                          {task.assignedTo && (
                            <span style={{
                              fontSize: '0.7rem',
                              padding: '0.1rem 0.4rem',
                              background: '#dbeafe',
                              color: '#1e40af',
                              borderRadius: '0.25rem',
                              whiteSpace: 'nowrap',
                            }}>
                              @{task.assignedTo.split('@')[0]}
                            </span>
                          )}

                          {task.hourlyRate && (
                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                              {task.hourlyRate}₪/שעה
                            </span>
                          )}

                          {task.archived && (
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>בארכיון</span>
                          )}

                          <button
                            onClick={() => handleEditTask(task)}
                            style={{
                              padding: '0.2rem 0.4rem',
                              fontSize: '0.75rem',
                              background: 'transparent',
                              border: '1px solid #cbd5e1',
                              borderRadius: '0.25rem',
                              cursor: 'pointer',
                            }}
                          >
                            ערוך
                          </button>

                          {!task.archived && (
                            <button
                              onClick={() => void handleArchiveTask(task)}
                              style={{
                                padding: '0.2rem 0.4rem',
                                fontSize: '0.75rem',
                                background: 'transparent',
                                border: '1px solid #fecaca',
                                borderRadius: '0.25rem',
                                cursor: 'pointer',
                                color: '#dc2626',
                              }}
                            >
                              ארכיון
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', margin: '0.5rem 0' }}>
                      אין משימות בפרויקט
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ProjectEditModal
        project={editingProject}
        isNew={isNewProject}
        onClose={() => setEditingProject(null)}
        onSave={handleSaveProject}
      />

      {/* Task Edit Modal */}
      {editingTask && (
        <FormModal
          isOpen={!!editingTask}
          onClose={() => setEditingTask(null)}
          onSave={() => void handleSaveTask()}
          title={isNewTask ? 'משימה חדשה' : 'עריכת משימה'}
        >
          <FormField label="שם">
            <input
              type="text"
              value={editingTask.name}
              onChange={(e) => setEditingTask({ ...editingTask, name: e.target.value })}
              autoFocus
              style={inputStyle}
            />
          </FormField>

          <FormField label="תעריף שעתי (אופציונלי)">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="number"
                value={editingTask.hourlyRate || ''}
                onChange={(e) => setEditingTask({ ...editingTask, hourlyRate: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="0"
                style={{ ...inputStyle, flex: 1 }}
              />
              <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>₪ / שעה</span>
            </div>
          </FormField>

          {teamMembers.length > 1 && (
            <FormField label="שיוך למשתמש">
              <select
                value={editingTask.assignedTo || ''}
                onChange={(e) => setEditingTask({ ...editingTask, assignedTo: e.target.value || undefined })}
                style={inputStyle}
              >
                <option value="">לא משויך</option>
                {teamMembers.map(m => (
                  <option key={m.email} value={m.email}>{m.email}</option>
                ))}
              </select>
            </FormField>
          )}
        </FormModal>
      )}
    </div>
  )
}
