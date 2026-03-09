export type ProfileQAAnswerType = 'word' | 'date' | 'paragraph' | 'photo' | 'file'

export type ProfileQA = {
  id?: number
  syncId?: string
  businessId: number
  question: string
  answerType: ProfileQAAnswerType
  isArray: boolean
  answer: string | string[]
  tags?: string[]
  siteKey?: string // Site-specific key (e.g. "weimar") for credentials tied to a specific site
  createdAt: string
  updatedAt: string
}
