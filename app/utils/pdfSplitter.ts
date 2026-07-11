import { PDFDocument } from 'pdf-lib'

// Pages per extraction call. One page per call (Agla's original suggestion):
// simplest possible mental model, smallest possible per-call output (least
// truncation risk), and the progress indicator's "page X of Y" is then
// literally accurate — no separate page-range bookkeeping needed. The
// tradeoff is more sequential round-trips (more wall-clock time), but
// reliability matters more than shaving a couple of Gemini calls here.
const PAGES_PER_CHUNK = 1

/**
 * Split a PDF into consecutive page-range chunks, each a standalone PDF File.
 * Returns the original file unchanged (as a 1-element array) if it's already
 * small enough that splitting wouldn't help.
 *
 * Chunks beyond the first do NOT carry the header page's image (tried that —
 * it works but costs a re-sent page every call). Instead the caller passes a
 * few-shot example built from the first chunk's own real extraction (see
 * pdfReader.ts) — cheaper, and empirically just as reliable: Israeli bank
 * statement exports print column headers (תאריך/תיאור/חובה/זכות/יתרה) only
 * once, on the first page, never repeated on continuation pages, so a
 * headerless chunk with no anchor at all returns every amount as null (#251)
 * — but a worked JSON example of the real column mapping fixes that just as
 * well as the header image did, without the extra document tokens.
 */
export async function splitPdfIntoChunks(file: File): Promise<File[]> {
  const bytes = await file.arrayBuffer()
  const doc = await PDFDocument.load(bytes)
  const pageCount = doc.getPageCount()

  if (pageCount <= PAGES_PER_CHUNK) {
    return [file]
  }

  const chunks: File[] = []
  for (let start = 0; start < pageCount; start += PAGES_PER_CHUNK) {
    const end = Math.min(start + PAGES_PER_CHUNK, pageCount)
    const pageIndices = Array.from({ length: end - start }, (_, i) => start + i)
    const chunkDoc = await PDFDocument.create()
    const copiedPages = await chunkDoc.copyPages(doc, pageIndices)
    for (const p of copiedPages) chunkDoc.addPage(p)
    const chunkBytes = await chunkDoc.save()
    const chunkFile = new File(
      [chunkBytes as BlobPart],
      `${file.name}.part${chunks.length + 1}.pdf`,
      { type: 'application/pdf' },
    )
    chunks.push(chunkFile)
  }
  return chunks
}
