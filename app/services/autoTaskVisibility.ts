// aglamazo#473: per-member "hide automatic reminders" on the Eisenhower matrix.
// Pure filter — the flag itself lives in appSettings (appSettingsStore.getHideAutoTasks).

export function visibleTasks<T extends { taskType: string }>(tasks: T[], hideAuto: boolean): T[] {
  if (!hideAuto) return tasks
  return tasks.filter(t => t.taskType !== 'auto')
}
