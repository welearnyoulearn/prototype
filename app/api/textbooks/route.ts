import { NextRequest, NextResponse } from 'next/server'
import pool, { ensureDB } from '@/lib/db'
import path from 'path'
import fs from 'fs/promises'

const UPLOAD_DIR = path.join(process.cwd(), 'textbook_uploads')
const CHUNK_SIZE = 1500   // chars per chunk
const OVERLAP    = 150    // chars of overlap between chunks

function chunkText(text: string): string[] {
  const chunks: string[] = []
  let i = 0
  while (i < text.length) {
    chunks.push(text.slice(i, i + CHUNK_SIZE))
    i += CHUNK_SIZE - OVERLAP
  }
  return chunks.filter(c => c.trim().length > 50)
}

// GET /api/textbooks?school_id=
export async function GET(req: NextRequest) {
  await ensureDB()
  const school_id = req.nextUrl.searchParams.get('school_id')
  const grade     = req.nextUrl.searchParams.get('grade')
  if (!school_id) return NextResponse.json({ error: 'school_id required' }, { status: 400 })
  try {
    let q = `SELECT id, school_id, grade, subject, book_title, file_name,
                    total_chunks, total_chars, uploaded_by_name, uploaded_at
             FROM textbook_library WHERE school_id=$1`
    const args: (string | number)[] = [school_id]
    if (grade) { q += ` AND grade=$2`; args.push(grade) }
    q += ` ORDER BY grade::int ASC NULLS LAST, subject ASC, uploaded_at DESC`
    const { rows } = await pool.query(q, args)
    return NextResponse.json(rows)
  } catch (err) {
    console.error('textbooks GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

// POST /api/textbooks  — multipart/form-data
// Fields: school_id, grade, subject, book_title?, uploaded_by_name?, file (PDF)
export async function POST(req: NextRequest) {
  await ensureDB()
  try {
    const formData   = await req.formData()
    const school_id  = formData.get('school_id') as string
    const grade      = formData.get('grade') as string
    const subject    = formData.get('subject') as string
    const book_title = (formData.get('book_title') as string) || null
    const uploader   = (formData.get('uploaded_by_name') as string) || null
    const file       = formData.get('file') as File | null

    if (!school_id || !grade || !subject || !file)
      return NextResponse.json({ error: 'school_id, grade, subject, file required' }, { status: 400 })

    if (!file.name.toLowerCase().endsWith('.pdf'))
      return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 })

    if (file.size > 50 * 1024 * 1024)
      return NextResponse.json({ error: 'File too large (max 50 MB)' }, { status: 400 })

    // Extract text using pdf-parse
    const buffer = Buffer.from(await file.arrayBuffer())
    // Dynamic import avoids edge-runtime issues with pdf-parse
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number }>
    const pdfData  = await pdfParse(buffer)
    const rawText  = pdfData.text ?? ''

    if (rawText.trim().length < 100)
      return NextResponse.json({ error: 'Could not extract readable text from this PDF. Try a text-based PDF (not scanned image).' }, { status: 422 })

    // Save file to disk
    await fs.mkdir(path.join(UPLOAD_DIR, school_id, grade), { recursive: true })
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const filePath = path.join(UPLOAD_DIR, school_id, grade, safeName)
    await fs.writeFile(filePath, buffer)

    // Insert library record
    const { rows: [lib] } = await pool.query(
      `INSERT INTO textbook_library
         (school_id, grade, subject, book_title, file_name, file_path, uploaded_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (school_id, grade, subject, file_name)
       DO UPDATE SET book_title=$4, file_path=$6, uploaded_by_name=$7, uploaded_at=NOW()
       RETURNING id`,
      [school_id, grade, subject, book_title ?? file.name, file.name, filePath, uploader],
    )
    const textbook_id = lib.id

    // Delete old chunks for this textbook (in case of re-upload)
    await pool.query(`DELETE FROM textbook_chunks WHERE textbook_id=$1`, [textbook_id])

    // Chunk and insert
    const chunks = chunkText(rawText)
    for (let i = 0; i < chunks.length; i++) {
      await pool.query(
        `INSERT INTO textbook_chunks (textbook_id, school_id, grade, subject, chunk_index, content)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [textbook_id, school_id, grade, subject, i, chunks[i]],
      )
    }

    // Update totals
    await pool.query(
      `UPDATE textbook_library SET total_chunks=$1, total_chars=$2 WHERE id=$3`,
      [chunks.length, rawText.length, textbook_id],
    )

    return NextResponse.json({
      ok: true,
      id: textbook_id,
      chunks: chunks.length,
      chars: rawText.length,
      pages: pdfData.numpages,
    })
  } catch (err) {
    console.error('textbooks POST error:', err)
    return NextResponse.json({ error: 'Upload failed: ' + String(err) }, { status: 500 })
  }
}
