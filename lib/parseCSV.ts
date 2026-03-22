/**
 * Proper CSV parser that handles quoted fields, commas inside quotes,
 * escaped quotes (""), and Windows/Unix line endings.
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  let i = 0

  while (i < normalised.length) {
    const fields: string[] = []
    // Parse one row
    while (i < normalised.length && normalised[i] !== '\n') {
      let field = ''
      if (normalised[i] === '"') {
        // Quoted field
        i++ // skip opening quote
        while (i < normalised.length) {
          if (normalised[i] === '"' && normalised[i + 1] === '"') {
            field += '"'
            i += 2
          } else if (normalised[i] === '"') {
            i++ // skip closing quote
            break
          } else {
            field += normalised[i]
            i++
          }
        }
        // skip optional whitespace before comma/newline
        while (i < normalised.length && normalised[i] === ' ') i++
      } else {
        // Unquoted field
        while (i < normalised.length && normalised[i] !== ',' && normalised[i] !== '\n') {
          field += normalised[i]
          i++
        }
        field = field.trim()
      }
      fields.push(field)
      if (i < normalised.length && normalised[i] === ',') i++ // skip comma
    }
    if (i < normalised.length && normalised[i] === '\n') i++ // skip newline

    if (fields.length > 0 && fields.some(f => f.trim())) {
      rows.push(fields)
    }
  }

  return rows
}

/** Parse CSV into array of objects using first row as headers */
export function parseCSVToObjects(text: string): Record<string, string>[] {
  const rows = parseCSV(text)
  if (rows.length < 2) return []
  const headers = rows[0].map(h => h.toLowerCase().trim())
  return rows.slice(1).map(row => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = row[i] ?? '' })
    return obj
  })
}
