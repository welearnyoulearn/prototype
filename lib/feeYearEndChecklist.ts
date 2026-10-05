// The year-end checklist (#343): which steps are done, which are next, which need attention.
// Pure so the rules can be tested; the Year-End screen feeds it live data.

export type StepStatus = 'done' | 'todo' | 'warn' | 'waiting'
export type ChecklistStep = { id: string; label: string; status: StepStatus; detail: string }

export type ChecklistInput = {
  year: string
  isClosed: boolean
  openStudents: number          // students still owing in this year
  openTotal: number
  signoff: { required: boolean; waiting: number; approverName: string | null }
  statementDone: boolean
  rolledOver: boolean | null    // null = not known yet
  registerOverdue: number       // open-dues register rows past their deadline for this year
}

const money = (n: number) => `₹${n.toLocaleString('en-IN')}`
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

export function buildChecklist(i: ChecklistInput): ChecklistStep[] {
  const steps: ChecklistStep[] = []

  steps.push({
    id: 'resolved',
    label: 'Every student with dues is resolved (carried, written off or moved to passout)',
    status: i.openStudents === 0 ? 'done' : i.isClosed ? 'warn' : 'todo',
    detail: i.openStudents === 0 ? 'Nothing left unpaid' : `${plural(i.openStudents, 'student')} · ${money(i.openTotal)} still open`,
  })

  if (i.signoff.required) {
    steps.push({
      id: 'signoff',
      label: `Write-offs signed off${i.signoff.approverName ? ` by ${i.signoff.approverName}` : ''}`,
      status: i.signoff.waiting === 0 ? 'done' : 'waiting',
      detail: i.signoff.waiting === 0 ? 'No write-off is waiting for sign-off' : `${plural(i.signoff.waiting, 'write-off')} waiting`,
    })
  }

  steps.push({
    id: 'statement',
    label: 'Year-end statement printed or exported',
    // Once the year is closed the print/export buttons are gone, so the step can't keep nagging.
    status: i.statementDone || i.isClosed ? 'done' : 'todo',
    detail: i.statementDone ? 'Done on this device' : i.isClosed ? 'Year closed — reprint any time from Reports' : 'Print the statement or export the ledger before closing',
  })

  steps.push({
    id: 'closed',
    label: `${i.year} closed`,
    status: i.isClosed ? 'done' : 'todo',
    detail: i.isClosed ? 'Locked — no more payments or edits'
      : i.openStudents > 0 ? `Closing needs a reason while ${plural(i.openStudents, 'student')} are still open` : 'Ready to close',
  })

  steps.push({
    id: 'leaveopen',
    label: 'Nothing left on Leave Open',
    status: !i.isClosed ? 'todo' : i.openStudents === 0 ? 'done' : 'warn',
    detail: !i.isClosed ? 'Checked once the year is closed'
      : i.openStudents === 0 ? 'No dues were left open'
      : `${plural(i.openStudents, 'student')} in the open-dues register${i.registerOverdue > 0 ? ` — ${i.registerOverdue} past deadline` : ''}`,
  })

  steps.push({
    id: 'rollover',
    label: 'Year rolled over (students promoted, new year active)',
    status: i.rolledOver ? 'done' : 'todo',
    detail: i.rolledOver ? 'Done' : i.isClosed ? 'Next: run Year Rollover' : 'Close the year first',
  })

  return steps
}

export function checklistProgress(steps: ChecklistStep[]): { done: number; total: number } {
  return { done: steps.filter(s => s.status === 'done').length, total: steps.length }
}
