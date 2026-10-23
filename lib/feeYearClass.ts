// A student's class changes at every rollover, but a fee report for 2026-27 should show the
// class they were in during 2026-27. Rollover records that in student_class_history
// (class, section and class roll per year); the current, un-rolled year has no row yet, so
// fall back to the student's live values.
//
// Join it onto a query that has the ledger and students aliased, then select/filter/group on
// the returned grade/section/roll expressions instead of s.grade / s.section:
//   const yc = yearClassSql()
//   FROM student_fee_ledger l JOIN students s ON s.id = l.student_id ${yc.join}
//   WHERE ${yc.grade} = $3
export function yearClassSql(studentAlias = 's', ledgerAlias = 'l') {
  const s = studentAlias, l = ledgerAlias
  return {
    join: `
  LEFT JOIN academic_years ay_c ON ay_c.school_id = ${l}.school_id AND ay_c.label = ${l}.academic_year
  LEFT JOIN student_class_history sch ON sch.student_id = ${l}.student_id AND sch.academic_year_id = ay_c.id`,
    grade: `COALESCE(sch.grade, ${s}.grade)`,
    section: `(CASE WHEN sch.student_id IS NOT NULL THEN sch.section ELSE ${s}.section END)`,
    roll: `COALESCE(sch.school_roll_number, ${s}.school_roll_number)`,
  }
}

const DEFAULT = yearClassSql()
export const YEAR_CLASS_JOIN = DEFAULT.join
export const CLASS_GRADE = DEFAULT.grade
export const CLASS_SECTION = DEFAULT.section
export const CLASS_ROLL = DEFAULT.roll
