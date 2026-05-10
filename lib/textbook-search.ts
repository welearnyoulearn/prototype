import pool from './db'

export type TextbookChunk = {
  content: string
  subject: string
  grade: string
  chunk_index: number
}

/**
 * Full-text search over textbook chunks stored for a school.
 * Returns the top `limit` chunks ranked by relevance.
 * Pass subject=null to search across all subjects for a grade.
 */
export async function searchTextbooks(
  school_id: number,
  grade: string,
  query: string,
  subject?: string | null,
  limit = 4,
): Promise<TextbookChunk[]> {
  if (!query?.trim()) return []
  try {
    const args: (string | number)[] = [school_id, grade, query.trim()]
    let subjectClause = ''
    if (subject) {
      subjectClause = `AND tc.subject = $${args.length + 1}`
      args.push(subject)
    }
    args.push(limit)

    const { rows } = await pool.query(
      `SELECT tc.content, tc.subject, tc.grade, tc.chunk_index,
              ts_rank(to_tsvector('english', tc.content), plainto_tsquery('english', $3)) AS rank
       FROM textbook_chunks tc
       WHERE tc.school_id = $1
         AND tc.grade = $2
         AND to_tsvector('english', tc.content) @@ plainto_tsquery('english', $3)
         ${subjectClause}
       ORDER BY rank DESC
       LIMIT $${args.length}`,
      args,
    )
    return rows
  } catch {
    return []
  }
}

/**
 * Build a concise context string from textbook chunks for injecting into AI prompts.
 * Returns empty string if no chunks found.
 */
export async function getTextbookContext(
  school_id: number,
  grade: string,
  query: string,
  subject?: string | null,
  limit = 3,
): Promise<string> {
  const chunks = await searchTextbooks(school_id, grade, query, subject, limit)
  if (!chunks.length) return ''
  const sections = chunks.map((c, i) =>
    `[Textbook – ${c.subject}${c.grade ? ` Gr.${c.grade}` : ''}, excerpt ${i + 1}]\n${c.content.slice(0, 900)}`
  )
  return sections.join('\n\n')
}
