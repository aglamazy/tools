'use client'

import { useState } from 'react'
import SupplierWizardModal from '../business/SupplierWizardModal'

const smallBtnStyle: React.CSSProperties = {
  padding: '0.25rem 0.6rem',
  fontSize: '0.75rem',
  background: '#f8fafc',
  color: '#475569',
  border: '1px solid #e2e8f0',
  borderRadius: '0.3rem',
  cursor: 'pointer',
}

type CategoriesToolbarActionsProps = {
  onReorganizeColors: () => void
  onExport: () => void
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export default function CategoriesToolbarActions({ onReorganizeColors, onExport, onImport }: CategoriesToolbarActionsProps) {
  const [supplierWizardOpen, setSupplierWizardOpen] = useState(false)

  return (
    <div style={{ marginInlineStart: 'auto', display: 'flex', gap: '0.4rem' }}>
      <button
        onClick={onReorganizeColors}
        style={smallBtnStyle}
        title="הקצאת צבעים מובחנים מחדש לכל הנושאים"
      >
        🎨 צבעים
      </button>
      <button
        onClick={onExport}
        style={smallBtnStyle}
        title="הורדת קובץ JSON עם כל הנושאים והסיווגים (גיבוי מקומי חד-פעמי — הסנכרון הרגיל נעשה בלשונית סנכרון)"
      >
        ⬇ ייצוא נושאים
      </button>
      <label style={{ ...smallBtnStyle, cursor: 'pointer' }} title="טעינת קובץ גיבוי של נושאים וסיווגים">
        ⬆ ייבוא נושאים
        <input type="file" accept=".json" onChange={onImport} style={{ display: 'none' }} />
      </label>
      <button
        onClick={() => setSupplierWizardOpen(true)}
        style={smallBtnStyle}
        title="סריקת Gmail לאיתור חשבוניות והתאמתן לספקים במערכת"
      >
        🏪 אשף ספקים
      </button>
      {supplierWizardOpen && (
        <SupplierWizardModal isOpen={supplierWizardOpen} onClose={() => setSupplierWizardOpen(false)} />
      )}
    </div>
  )
}
