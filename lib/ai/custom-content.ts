// Ingestion for CUSTOM subject content — direct-context-injection design,
// deliberately separate from the standard-content RAG pipeline
// (lib/ai/ingestion + scripts/ai-hub/ingest-syllabus.ts, which chunks,
// embeds, and writes to Chroma). A custom subject is small (~10-15
// chapters), so its extracted text is stored as-is and injected straight
// into the LLM prompt at query time — no chunking, no embed_text() calls,
// no vector DB writes. If you find yourself wanting to embed this content,
// stop — that's the old, incorrect design this replaces.
import pool from '@/lib/db'
import { downloadR2Object } from '@/lib/r2'
import { extractPdfText, isLikelyScanned, ocrScannedPdf } from './ingestion/pdf-text'
import { extractChapterListFromToc, splitByChapters } from './ingestion/chapters'

const TOC_PAGE_COUNT = 5

// Runs the whole extract-and-store pipeline for one uploaded PDF. Never
// throws — the caller (an API route) invokes this fire-and-forget, so
// failures are logged here (there's no admin UI yet to surface them) rather
// than raised as an unhandled rejection.
export async function ingestCustomSubjectPdf(params: {
  schoolId: number
  customSubjectId: number
  r2Key: string
  bookTitle: string
  academicYear: string
}): Promise<void> {
  const { schoolId, customSubjectId, r2Key, bookTitle, academicYear } = params
  console.log(`[custom-content] start school=${schoolId} subject=${customSubjectId} key=${r2Key}`)

  try {
    const buffer = await downloadR2Object(r2Key)

    let { pages } = await extractPdfText(buffer)
    if (isLikelyScanned(pages)) {
      console.log(`[custom-content] ${r2Key} looks scanned (low text density) — attempting OCR fallback...`)
      try {
        pages = await ocrScannedPdf(buffer)
      } catch (ocrErr) {
        throw new Error(`OCR fallback failed: ${(ocrErr as Error).message}`)
      }
    }
    if (pages.join('').trim().length < 100) {
      throw new Error('No readable text extracted (empty or corrupt PDF)')
    }

    const tocText = pages.slice(0, TOC_PAGE_COUNT).join('\n')
    const bodyText = pages.slice(TOC_PAGE_COUNT).join('\n\n') || pages.join('\n\n')

    const markers = extractChapterListFromToc(tocText)
    let sections = splitByChapters(bodyText, markers)
    if (sections.length === 0) {
      console.log(`[custom-content] ${r2Key}: no usable index detected — storing as one whole-book chapter "${bookTitle}"`)
      sections = [{ chapter: bookTitle, text: bodyText }]
    } else {
      console.log(`[custom-content] ${r2Key}: detected ${sections.length} chapter(s) from index`)
    }

    for (const section of sections) {
      // ON CONFLICT (custom_subject_id, chapter) — a re-upload for this
      // subject overwrites that chapter's content in place rather than
      // duplicating rows, per the unique constraint on custom_subject_chapters.
      await pool.query(
        `INSERT INTO custom_subject_chapters
           (school_id, custom_subject_id, chapter, content_text, academic_year, source_file_key, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (custom_subject_id, chapter) DO UPDATE SET
           content_text = EXCLUDED.content_text,
           academic_year = EXCLUDED.academic_year,
           source_file_key = EXCLUDED.source_file_key,
           updated_at = NOW()`,
        [schoolId, customSubjectId, section.chapter, section.text, academicYear, r2Key]
      )
    }

    console.log(`[custom-content] done — ${sections.length} chapter row(s) upserted for subject=${customSubjectId}, key=${r2Key}`)
  } catch (err) {
    console.error(`[custom-content] FAILED for ${r2Key} (subject=${customSubjectId}):`, err)
  }
}
