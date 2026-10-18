import { businessStore } from '@/app/stores/businessStore'

/**
 * Lesson-rate text to prefill into a new-student form: the business's
 * defaultLessonRate (aglamazo#428), or '' when the business has none (0/unset).
 * The form keeps it editable — this is only the starting value.
 */
export async function getPrefilledLessonRate(businessSyncId: string): Promise<string> {
  const business = await businessStore.getBySyncId(businessSyncId)
  const rate = business?.defaultLessonRate
  return rate && rate > 0 ? String(rate) : ''
}
