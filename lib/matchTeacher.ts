// Smart 3-level subject→teacher matching used across timetable generation and subject assignment.
// Level 1: exact match (case-insensitive)
// Level 2: one name contains the other ("Maths" matches "Mathematics")
// Level 3: any meaningful word in common ("Social Studies" matches "Social Science")
export function matchTeacher(
  subjectName: string,
  teachers: { id: number; subject: string }[]
): number | null {
  const sn = subjectName.trim().toLowerCase()
  const exact = teachers.find(t => t.subject.trim().toLowerCase() === sn)
  if (exact) return exact.id
  const partial = teachers.find(t => {
    const ts = t.subject.trim().toLowerCase()
    return ts.includes(sn) || sn.includes(ts)
  })
  if (partial) return partial.id
  const snWords = sn.split(/[\s/,&]+/).filter(w => w.length > 2)
  const wordMatch = teachers.find(t => {
    const tWords = t.subject.trim().toLowerCase().split(/[\s/,&]+/)
    return snWords.some(sw => tWords.some(tw => tw.includes(sw) || sw.includes(tw)))
  })
  return wordMatch?.id ?? null
}
