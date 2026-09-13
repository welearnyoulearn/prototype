// PDF text extraction for the AI Hub syllabus ingestion pipeline, built on
// pdf-parse v2's `PDFParse` class (already a repo dependency — see
// app/api/textbooks/route.ts, though that route still uses the old v1
// function-call API and would need updating separately; out of scope here).
//
// OCR fallback: only triggered when a PDF has very little extractable text
// per page (i.e. it's scanned page-images, not real text). Uses pdf-parse's
// built-in `getScreenshot()` to rasterize each page to PNG (no separate
// pdfjs-dist/canvas wiring needed), then OCRs with tesseract.js.
// Best-effort: any OCR failure is caught by the caller and logged, never
// crashes the whole ingestion run.
import { PDFParse } from 'pdf-parse'
import { createWorker } from 'tesseract.js'

export type ExtractedPdf = {
  pages: string[]      // one entry per page, in order
  numpages: number
}

// Below this average chars/page, a page is treated as image-only (scanned).
const SCANNED_PAGE_CHAR_THRESHOLD = 40

export async function extractPdfText(buffer: Buffer): Promise<ExtractedPdf> {
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    const pages = result.pages
      .slice()
      .sort((a, b) => a.num - b.num)
      .map(p => p.text)
    return { pages, numpages: result.total }
  } finally {
    await parser.destroy()
  }
}

export function isLikelyScanned(pages: string[]): boolean {
  if (pages.length === 0) return true
  const avgChars = pages.reduce((sum, p) => sum + p.trim().length, 0) / pages.length
  return avgChars < SCANNED_PAGE_CHAR_THRESHOLD
}

// OCRs every page of a scanned PDF. Throws on failure — caller must catch
// and log the file as failed rather than letting one bad PDF kill the run.
export async function ocrScannedPdf(buffer: Buffer): Promise<string[]> {
  const parser = new PDFParse({ data: buffer })
  const worker = await createWorker('eng')
  try {
    const screenshots = await parser.getScreenshot({ scale: 2.0 })
    const texts: string[] = []
    for (const page of screenshots.pages.sort((a, b) => a.pageNumber - b.pageNumber)) {
      const { data } = await worker.recognize(Buffer.from(page.data))
      texts.push(data.text)
    }
    return texts
  } finally {
    await worker.terminate()
    await parser.destroy()
  }
}
