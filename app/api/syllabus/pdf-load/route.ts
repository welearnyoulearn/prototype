import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { extractSyllabusFromPDF } from '@/lib/gemini'

// POST /api/syllabus/pdf-load
// Multipart: { school_id, class_id, grade, subject, uploaded_by_name?, file }
// Extracts PDF text → stores textbook chunks → AI generates chapter/topic structure
// → inserts all topics as published=FALSE drafts
// Returns: { ok, inserted, chapters_count, textbook_id, pages, chunks }
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const school_id = Number(formData.get('school_id'))
    const class_id  = Number(formData.get('class_id'))
    const grade     = String(formData.get('grade') ?? '')
    const subject   = String(formData.get('subject') ?? '')
    const uploaded_by_name = String(formData.get('uploaded_by_name') ?? 'HOD')
    const file = formData.get('file') as File | null

    if (!school_id || !class_id || !grade || !subject || !file) {
      return NextResponse.json(
        { error: 'school_id, class_id, grade, subject, and file are required' },
        { status: 400 }
      )
    }

    // Extract PDF text
    const buf = Buffer.from(await file.arrayBuffer())
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number }>
    const { text, numpages } = await pdfParse(buf)

    if (!text?.trim()) {
      return NextResponse.json(
        { error: 'PDF appears to be a scanned image or is empty — please upload a text-based PDF' },
        { status: 422 }
      )
    }

    // Chunk text for textbook_chunks table (1500 chars, 150 overlap)
    const CHUNK_SIZE = 1500
    const OVERLAP    = 150
    const chunks: string[] = []
    let pos = 0
    while (pos < text.length) {
      chunks.push(text.slice(pos, pos + CHUNK_SIZE))
      pos += CHUNK_SIZE - OVERLAP
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Upsert textbook library entry
      const bookTitle = file.name.replace(/\.pdf$/i, '')
      const { rows: [book] } = await client.query<{ id: number }>(`
        INSERT INTO textbook_library
          (school_id, grade, subject, book_title, file_name, total_chunks, total_chars, uploaded_by_name)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (school_id, grade, subject, file_name) DO UPDATE
          SET total_chunks     = EXCLUDED.total_chunks,
              total_chars      = EXCLUDED.total_chars,
              uploaded_by_name = EXCLUDED.uploaded_by_name,
              uploaded_at      = NOW()
        RETURNING id
      `, [school_id, grade, subject, bookTitle, file.name, chunks.length, text.length, uploaded_by_name])

      const textbookId = book.id

      // Replace chunks for this textbook
      await client.query('DELETE FROM textbook_chunks WHERE textbook_id = $1', [textbookId])
      for (let i = 0; i < chunks.length; i++) {
        await client.query(
          'INSERT INTO textbook_chunks (textbook_id, school_id, grade, subject, chunk_index, content) VALUES ($1,$2,$3,$4,$5,$6)',
          [textbookId, school_id, grade, subject, i, chunks[i]]
        )
      }

      // Ask AI to extract chapter/topic structure from the PDF text
      const syllabusChapters = await extractSyllabusFromPDF(text, subject, grade)

      if (!Array.isArray(syllabusChapters) || syllabusChapters.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { error: 'AI could not extract a syllabus structure from this PDF. Try a different PDF or add chapters manually.' },
          { status: 422 }
        )
      }

      // Insert all topics as unpublished drafts
      let inserted = 0
      for (const ch of syllabusChapters) {
        for (const topic of ch.topics) {
          await client.query(`
            INSERT INTO syllabus_topics
              (school_id, class_id, subject, chapter_name, chapter_order, topic_name, topic_order, published, status)
            VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE,'pending')
            ON CONFLICT (class_id, subject, chapter_name, topic_name) DO NOTHING
          `, [school_id, class_id, subject, ch.name, ch.order, topic.name, topic.order])
          inserted++
        }
      }

      await client.query('COMMIT')

      return NextResponse.json({
        ok: true,
        inserted,
        chapters_count: syllabusChapters.length,
        textbook_id: textbookId,
        pages: numpages,
        chunks: chunks.length,
      })
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('pdf-load error:', error)
    return NextResponse.json({ error: 'Failed to process PDF' }, { status: 500 })
  }
}
