import { useEffect, useRef, useState } from 'react'
import type { ImportedFile } from '@/app/db/financeDB'
import { findFileByParam } from './sourceFileLink'

/**
 * Import page side of aglamazo#464: `/app/import?file=<fileKey>` (the link
 * on a budget transaction) scrolls to that file's row, highlights it and
 * opens its view, once per param value, after the file list has loaded and
 * the row's month is shown.
 */
export function useFocusFileParam(
  files: ImportedFile[],
  selectedMonth: string,
  param: string | null,
  openFile: (file: ImportedFile) => void,
): string | null {
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const handled = useRef<string | null>(null)
  useEffect(() => {
    if (!param || handled.current === param) return
    const file = findFileByParam(files, param)
    if (!file || (file.processingMonth && file.processingMonth !== selectedMonth)) return
    handled.current = param
    setFocusedKey(param)
    console.log('[import] focusing file from ?file= param', param)
    requestAnimationFrame(() => {
      document.getElementById(fileRowId(param))?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    openFile(file)
  }, [files, selectedMonth, param, openFile])
  return focusedKey
}

export function fileRowId(fileKey: string): string {
  return `file-${fileKey}`
}
