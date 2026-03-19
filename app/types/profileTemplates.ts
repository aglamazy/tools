import type { ProfileCategory, ProfileGroupType, ProfileQAAnswerType } from './profileQA'

export type ProfileFieldTemplate = {
  question: string
  questionEn: string // English label for AI matching
  answerType: ProfileQAAnswerType
  placeholder?: string
}

export type ProfileGroupTemplate = {
  type: ProfileGroupType
  category: ProfileCategory
  label: string       // Hebrew
  labelEn: string     // English
  fields: ProfileFieldTemplate[]
}

export type ProfileSectionConfig = {
  category: ProfileCategory
  label: string
  labelEn: string
  flatFields: ProfileFieldTemplate[]
  groupTemplates: ProfileGroupTemplate[]
}

export const PROFILE_SECTIONS: ProfileSectionConfig[] = [
  {
    category: 'personal',
    label: 'פרטים אישיים',
    labelEn: 'Personal Info',
    flatFields: [
      { question: 'שם פרטי', questionEn: 'First name', answerType: 'word' },
      { question: 'שם משפחה', questionEn: 'Last name', answerType: 'word' },
      { question: 'שם מלא', questionEn: 'Full name', answerType: 'word' },
      { question: 'תאריך לידה', questionEn: 'Date of birth', answerType: 'date' },
      { question: 'מקום לידה', questionEn: 'Place of birth', answerType: 'word' },
      { question: 'מין', questionEn: 'Gender', answerType: 'word' },
      { question: 'אזרחות', questionEn: 'Nationality', answerType: 'word' },
      { question: 'תעודת זהות', questionEn: 'ID number', answerType: 'word' },
      { question: 'מספר דרכון', questionEn: 'Passport number', answerType: 'word' },
    ],
    groupTemplates: [],
  },
  {
    category: 'contact',
    label: 'פרטי קשר',
    labelEn: 'Contact',
    flatFields: [
      { question: 'אימייל', questionEn: 'Email', answerType: 'word' },
      { question: 'טלפון', questionEn: 'Phone', answerType: 'word' },
      { question: 'כתובת', questionEn: 'Address', answerType: 'word' },
      { question: 'עיר', questionEn: 'City', answerType: 'word' },
      { question: 'מיקוד', questionEn: 'Postcode', answerType: 'word' },
      { question: 'מדינה', questionEn: 'Country', answerType: 'word' },
    ],
    groupTemplates: [],
  },
  {
    category: 'education',
    label: 'השכלה',
    labelEn: 'Education',
    flatFields: [],
    groupTemplates: [
      {
        type: 'study',
        category: 'education',
        label: 'תקופת לימודים',
        labelEn: 'Study period',
        fields: [
          { question: 'מוסד', questionEn: 'Institution', answerType: 'word' },
          { question: 'תואר', questionEn: 'Degree', answerType: 'word', placeholder: 'B.A / M.A / B.Mus / M.Mus / PhD' },
          { question: 'תחום', questionEn: 'Field of study', answerType: 'word' },
          { question: 'שנת התחלה', questionEn: 'Start year', answerType: 'word' },
          { question: 'שנת סיום', questionEn: 'End year', answerType: 'word' },
          { question: 'הושלם', questionEn: 'Completed', answerType: 'word', placeholder: 'Ja / Nein' },
          { question: 'ציון', questionEn: 'Grade / GPA', answerType: 'word' },
          { question: 'נושא עבודה', questionEn: 'Thesis title', answerType: 'word' },
        ],
      },
      {
        type: 'course',
        category: 'education',
        label: 'קורס',
        labelEn: 'Course',
        fields: [
          { question: 'שם קורס', questionEn: 'Course name', answerType: 'word' },
          { question: 'סמסטר', questionEn: 'Semester', answerType: 'word', placeholder: 'WS2025 / SS2026' },
          { question: 'מרצה', questionEn: 'Professor', answerType: 'word' },
          { question: 'מועד', questionEn: 'Schedule', answerType: 'word' },
          { question: 'נקודות', questionEn: 'Credits', answerType: 'word' },
          { question: 'ציון', questionEn: 'Grade', answerType: 'word' },
        ],
      },
    ],
  },
  {
    category: 'work',
    label: 'ניסיון מקצועי',
    labelEn: 'Work Experience',
    flatFields: [],
    groupTemplates: [
      {
        type: 'job',
        category: 'work',
        label: 'תפקיד',
        labelEn: 'Position',
        fields: [
          { question: 'מעסיק', questionEn: 'Employer / Organization', answerType: 'word' },
          { question: 'תפקיד', questionEn: 'Role / Position', answerType: 'word' },
          { question: 'תאריך התחלה', questionEn: 'Start date', answerType: 'date' },
          { question: 'תאריך סיום', questionEn: 'End date', answerType: 'date' },
          { question: 'תיאור', questionEn: 'Description', answerType: 'paragraph' },
        ],
      },
    ],
  },
  {
    category: 'banking',
    label: 'בנקאות',
    labelEn: 'Banking',
    flatFields: [
      { question: 'שם בנק', questionEn: 'Bank name', answerType: 'word' },
      { question: 'סניף', questionEn: 'Branch', answerType: 'word' },
      { question: 'מספר חשבון', questionEn: 'Account number', answerType: 'word' },
      { question: 'IBAN', questionEn: 'IBAN', answerType: 'word' },
      { question: 'BIC/SWIFT', questionEn: 'BIC/SWIFT', answerType: 'word' },
    ],
    groupTemplates: [],
  },
]
