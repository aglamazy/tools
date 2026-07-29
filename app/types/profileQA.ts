export type ProfileQAAnswerType = 'word' | 'date' | 'paragraph' | 'photo' | 'file'

export type ProfileCategory = 'personal' | 'contact' | 'education' | 'work' | 'banking' | 'custom'

export type ProfileGroupType = 'study' | 'course' | 'job'

export type ProfileQA = {
  id?: number
  syncId?: string
  businessId: string
  question: string
  answerType: ProfileQAAnswerType
  isArray: boolean
  answer: string | string[]
  tags?: string[]
  siteKey?: string // Site-specific key (e.g. "weimar") for credentials tied to a specific site
  category?: ProfileCategory
  groupId?: string       // links related facts into a record (e.g. "study-1")
  groupType?: ProfileGroupType
  groupLabel?: string    // display label (e.g. "B.Mus — HfM Weimar")
  createdAt: string
  updatedAt: string
}
