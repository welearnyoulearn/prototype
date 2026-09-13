// Lists and parses syllabus PDFs from R2 under
// materials/{board}/{grade}/{subject}/{type}/{filename}.pdf
// (type = textbooks/handbooks/workbooks — added after the platform-admin
// upload flow was reorganized to file materials by type; see
// app/api/platform/materials/upload-sign/route.ts). Older uploads made
// before that change are still flat (4 segments, no type folder) — both
// shapes are handled here.
//
// Reuses the existing lib/r2.ts client/bucket config — no new R2 credentials
// or client instantiation, per the repo's "one shared client" convention.
import { ListObjectsV2Command } from '@aws-sdk/client-s3'
import { r2Config } from '../../../lib/r2'

export type MaterialType = 'textbooks' | 'handbooks' | 'workbooks' | 'unknown'

export type MaterialObject = {
  key: string
  board: string
  grade: string          // normalized, e.g. "10" (not "grade-10")
  subject: string        // normalized, e.g. "Biological Science" (not "Biological_Science")
  materialType: MaterialType
  bookTitle: string      // derived from the filename, e.g. "Biological Science"
  etag: string | null
  lastModified: string | null // ISO string
}

export type UnparsableObject = { key: string; reason: string }

const MATERIALS_PREFIX = 'materials/'
const KNOWN_TYPE_FOLDERS = new Set(['textbooks', 'handbooks', 'workbooks'])

// filename observed in the real bucket as "{r2-timestamp}-{random}-{TITLE}.pdf"
// (e.g. "1788093451053-gvjue5-BIOLOGICAL_SCIENCE.pdf") — we strip that prefix
// to get a readable book title.
function parseKey(key: string): MaterialObject | UnparsableObject {
  const withoutPrefix = key.slice(MATERIALS_PREFIX.length)
  const parts = withoutPrefix.split('/')

  let board: string, gradeSeg: string, subjectSeg: string, filename: string
  let materialType: MaterialType = 'unknown'

  if (parts.length === 5 && KNOWN_TYPE_FOLDERS.has(parts[3])) {
    ;[board, gradeSeg, subjectSeg, , filename] = parts
    materialType = parts[3] as MaterialType
  } else if (parts.length === 4) {
    ;[board, gradeSeg, subjectSeg, filename] = parts
  } else {
    return { key, reason: `Expected materials/{board}/{grade}/{subject}/[type/]{file}.pdf, got ${parts.length} segments` }
  }

  if (!filename.toLowerCase().endsWith('.pdf')) {
    return { key, reason: 'Not a .pdf file' }
  }

  const gradeMatch = /^grade-(\d{1,2})$/i.exec(gradeSeg)
  const grade = gradeMatch ? gradeMatch[1] : gradeSeg.replace(/^grade-?/i, '')
  if (!/^\d{1,2}$/.test(grade)) {
    return { key, reason: `Could not parse a numeric grade from "${gradeSeg}"` }
  }

  const subject = subjectSeg.replace(/_/g, ' ').trim()
  if (!subject) return { key, reason: `Empty subject segment` }

  const nameNoExt = filename.replace(/\.pdf$/i, '')
  const titleMatch = /^\d{6,}-[a-z0-9]{4,}-(.+)$/i.exec(nameNoExt)
  const bookTitle = (titleMatch ? titleMatch[1] : nameNoExt).replace(/_/g, ' ').trim()

  return { key, board, grade, subject, materialType, bookTitle, etag: null, lastModified: null }
}

export async function listMaterialObjects(opts?: { onlyType?: MaterialType }): Promise<{
  parsed: MaterialObject[]
  skipped: MaterialObject[]   // parsed fine, just filtered out by onlyType
  unparsable: UnparsableObject[]
}> {
  const { client, bucket } = r2Config()
  const parsed: MaterialObject[] = []
  const skipped: MaterialObject[] = []
  const unparsable: UnparsableObject[] = []

  let continuationToken: string | undefined
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: MATERIALS_PREFIX,
      ContinuationToken: continuationToken,
    }))
    for (const obj of res.Contents ?? []) {
      if (!obj.Key || obj.Key.endsWith('/')) continue // skip "folder" placeholder objects
      const result = parseKey(obj.Key)
      if ('reason' in result) {
        unparsable.push(result)
        continue
      }
      const full: MaterialObject = {
        ...result,
        etag: obj.ETag ?? null,
        lastModified: obj.LastModified?.toISOString() ?? null,
      }
      if (opts?.onlyType && full.materialType !== opts.onlyType) {
        skipped.push(full)
      } else {
        parsed.push(full)
      }
    }
    continuationToken = res.NextContinuationToken
  } while (continuationToken)

  return { parsed, skipped, unparsable }
}
