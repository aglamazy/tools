import type { ImportedFile } from '@/app/db/financeDB'

/**
 * aglamazo#464: every budget transaction links to the file it was imported
 * from, so a cross-file duplicate can be traced to its file and that file
 * deleted on the import page.
 *
 * fileId is the import key `${Date.now()}-${originalName}`; the display name
 * strips the leading '<digits>-' prefix.
 */
export function sourceFileName(fileId: string): string {
  return fileId.replace(/^\d+-/, '')
}

export function sourceFileHref(fileId: string): string {
  return `/app/import?file=${encodeURIComponent(fileId)}`
}

/** The import-page row matching the `?file=` param (fileKey === fileId). */
export function findFileByParam(files: ImportedFile[], param: string | null): ImportedFile | undefined {
  if (!param) return undefined
  return files.find((f) => f.fileKey === param)
}
