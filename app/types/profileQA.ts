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
  createdAt: string
  updatedAt: string
}
