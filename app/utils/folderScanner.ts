import type { FilePreview } from '@/app/types/file-preview'
import { FileType } from '@/app/types/file-type'
import { extractFileMetadata } from '@/app/utils/filePreview'

type Subfolder = { name: string; handle: FileSystemDirectoryHandle }

export type ScanResult = {
  files: FilePreview[]
  subfolders: Subfolder[]
}

/**
 * Scan a directory for Excel files and subfolders.
 */
export async function scanDirectoryForFiles(dirHandle: FileSystemDirectoryHandle): Promise<ScanResult> {
  const fileHandles: FileSystemFileHandle[] = []
  const subfolders: Subfolder[] = []

  const dirHandleWithEntries = dirHandle as FileSystemDirectoryHandle & {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>
  }

  for await (const [, entry] of dirHandleWithEntries.entries()) {
    if (entry.kind === 'directory') {
      subfolders.push({ name: entry.name, handle: entry as FileSystemDirectoryHandle })
    } else if (entry.kind === 'file') {
      const fileName = entry.name.toLowerCase()
      if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) {
        fileHandles.push(entry as FileSystemFileHandle)
      }
    }
  }

  subfolders.sort((a, b) => a.name.localeCompare(b.name))

  const previewPromises = fileHandles.map(async (fileHandle): Promise<FilePreview | null> => {
    try {
      const file = await fileHandle.getFile()
      const metadata = await extractFileMetadata(file)

      if (metadata.fileType !== FileType.Bank && metadata.fileType !== FileType.CreditCard) {
        return null
      }

      return {
        fileName: fileHandle.name,
        fileHandle,
        fileType: metadata.fileType,
        processingMonth: metadata.processingMonth || null,
        transactionCount: metadata.transactionCount,
        accountNumber: metadata.accountNumber || null,
        cardNumber: metadata.cardNumber || null,
      }
    } catch {
      return null
    }
  })

  const results = await Promise.all(previewPromises)
  const files = results.filter((p): p is FilePreview => p !== null)

  return { files, subfolders }
}

/**
 * Scan directory and year-named subfolders (depth 1).
 */
export async function scanDirectoryRecursive(dirHandle: FileSystemDirectoryHandle): Promise<FilePreview[]> {
  const { files, subfolders } = await scanDirectoryForFiles(dirHandle)

  const yearFolders = subfolders.filter((f) => /^\d{4}$/.test(f.name))

  const subResults = await Promise.all(
    yearFolders.map(async (folder) => {
      const result = await scanDirectoryForFiles(folder.handle)
      return result.files
    })
  )

  return [...files, ...subResults.flat()]
}
