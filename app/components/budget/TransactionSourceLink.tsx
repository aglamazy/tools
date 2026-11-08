import { sourceFileHref, sourceFileName } from './sourceFileLink'

/** Source-file link under a budget transaction row (aglamazo#464). */
export default function TransactionSourceLink({ fileId }: { fileId?: string }) {
  if (!fileId) return null
  return (
    <a
      href={sourceFileHref(fileId)}
      title="קובץ המקור — צפייה או מחיקה בדף הייבוא"
      style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', textDecoration: 'none' }}
    >
      📄 <bdi>{sourceFileName(fileId)}</bdi>
    </a>
  )
}
