'use client'

// The fields of "what WLYL keeps about a school" (DOCS/SCHOOL-ONBOARDING.md §1), in sections. Used by the
// Add School wizard (one section per step) and by Platform Admin → the school's page (all at once), with the
// same rules as the server (lib/schoolDetails.ts).
import { INDIAN_STATES, gstinProblem } from '@/lib/gst'
import { GRADE_SEQUENCE } from '@/lib/grades'
import { BOARDS, ENTITY_TYPES, MEDIUMS, schoolDetailsSchema, type SchoolDetailsInput } from '@/lib/schoolDetails'
import { sanitizeMobileTyping } from '@/lib/phone'

export type DetailsForm = {
  legalName: string; entityType: string; address: string; city: string; stateCode: string; pin: string; phone: string; website: string
  gstin: string; pan: string
  board: string; medium: string; classesFrom: string; classesTo: string; academicStartMonth: string; udiseCode: string; affiliationNo: string
  principal: { name: string; mobile: string; email: string }
  correspondent: { name: string; mobile: string; email: string }
  accountant: { name: string; mobile: string; email: string }
  approxStudents: string; approxStaff: string; salesOwnerId: string; referralSource: string; goLiveDate: string; notes: string
  portals: boolean; whatsapp: boolean; onlineFees: 'yes' | 'later' | 'no'; dataImport: boolean
}
const person = { name: '', mobile: '', email: '' }
export const EMPTY_DETAILS: DetailsForm = {
  legalName: '', entityType: 'trust', address: '', city: '', stateCode: '', pin: '', phone: '', website: '', gstin: '', pan: '',
  board: 'CBSE', medium: 'English', classesFrom: 'Nursery', classesTo: '10', academicStartMonth: '6', udiseCode: '', affiliationNo: '',
  principal: { ...person }, correspondent: { ...person }, accountant: { ...person },
  approxStudents: '', approxStaff: '', salesOwnerId: '', referralSource: '', goLiveDate: '', notes: '',
  portals: true, whatsapp: true, onlineFees: 'later', dataImport: false,
}
export type Section = 'school' | 'tax' | 'profile' | 'contacts' | 'size' | 'needs'
const SECTION_KEYS: Record<Section, string[]> = {
  school: ['legalName', 'entityType', 'address', 'city', 'stateCode', 'pin', 'phone', 'website'],
  tax: ['gstin', 'pan'],
  profile: ['board', 'medium', 'classesFrom', 'classesTo', 'academicStartMonth', 'udiseCode', 'affiliationNo'],
  contacts: ['contacts'],
  size: ['approxStudents', 'approxStaff', 'salesOwnerId', 'referralSource', 'goLiveDate', 'notes'],
  needs: ['needs'],
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const ENTITY_LABEL: Record<string, string> = { trust: 'Trust', society: 'Society', company: 'Company', proprietor: 'Proprietor', government: 'Government', other: 'Other' }

const num = (v: string) => (v.trim() === '' ? undefined : Number(v))
const opt = (v: string) => v.trim() || undefined
const contactOf = (c: { name: string; mobile: string; email: string }) => (c.name.trim() || c.mobile.trim() || c.email.trim())
  ? { name: c.name.trim(), mobile: opt(c.mobile), email: opt(c.email) } : undefined

export function toInput(f: DetailsForm): SchoolDetailsInput {
  return {
    legalName: f.legalName, entityType: f.entityType as SchoolDetailsInput['entityType'], address: f.address, city: f.city, stateCode: f.stateCode,
    pin: f.pin, phone: opt(f.phone), website: opt(f.website), gstin: opt(f.gstin), pan: opt(f.pan),
    board: f.board as SchoolDetailsInput['board'], medium: f.medium as SchoolDetailsInput['medium'], classesFrom: f.classesFrom, classesTo: f.classesTo,
    academicStartMonth: Number(f.academicStartMonth), udiseCode: opt(f.udiseCode), affiliationNo: opt(f.affiliationNo),
    contacts: { principal: contactOf(f.principal), correspondent: contactOf(f.correspondent), accountant: contactOf(f.accountant) },
    approxStudents: num(f.approxStudents) as number, approxStaff: num(f.approxStaff) as number,
    salesOwnerId: f.salesOwnerId ? Number(f.salesOwnerId) : null, referralSource: opt(f.referralSource), goLiveDate: f.goLiveDate || '', notes: opt(f.notes),
    needs: { portals: f.portals, whatsapp: f.whatsapp, onlineFees: f.onlineFees, dataImport: f.dataImport },
  }
}

export function fromSaved(d: Partial<SchoolDetailsInput> & { contacts?: Record<string, { name: string; mobile: string | null; email: string | null }> }): DetailsForm {
  const c = (r: string) => { const x = d.contacts?.[r]; return x ? { name: x.name, mobile: x.mobile ?? '', email: x.email ?? '' } : { ...person } }
  const s = (v: unknown, dflt: string) => (v == null || v === '' ? dflt : String(v))
  const needs = (d.needs ?? {}) as Partial<DetailsForm>
  return {
    ...EMPTY_DETAILS,
    legalName: s(d.legalName, ''), entityType: s(d.entityType, 'trust'), address: s(d.address, ''), city: s(d.city, ''), stateCode: s(d.stateCode, ''),
    pin: s(d.pin, ''), phone: s(d.phone, ''), website: s(d.website, ''), gstin: s(d.gstin, ''), pan: s(d.pan, ''),
    board: s(d.board, 'CBSE'), medium: s(d.medium, 'English'), classesFrom: s(d.classesFrom, 'Nursery'), classesTo: s(d.classesTo, '10'),
    academicStartMonth: s(d.academicStartMonth, '6'), udiseCode: s(d.udiseCode, ''), affiliationNo: s(d.affiliationNo, ''),
    principal: c('principal'), correspondent: c('correspondent'), accountant: c('accountant'),
    approxStudents: s(d.approxStudents, ''), approxStaff: s(d.approxStaff, ''), salesOwnerId: s(d.salesOwnerId, ''),
    referralSource: s(d.referralSource, ''), goLiveDate: s(d.goLiveDate, ''), notes: s(d.notes, ''),
    portals: needs.portals ?? true, whatsapp: needs.whatsapp ?? true, onlineFees: needs.onlineFees ?? 'later', dataImport: needs.dataImport ?? false,
  }
}

// The first problem in these sections ('' when they are fine) — same rules as the server.
export function sectionProblem(f: DetailsForm, sections: Section[]): string {
  // The schema's cross-field checks only run once every field is valid, so check this step's own here too.
  if (sections.includes('tax') && f.gstin.trim()) { const p = gstinProblem(f.gstin.trim().toUpperCase(), f.stateCode || null); if (p) return p }
  if (sections.includes('profile') && GRADE_SEQUENCE.indexOf(f.classesTo) < GRADE_SEQUENCE.indexOf(f.classesFrom)) return '"Classes to" must be the same as or after "classes from"'
  if (sections.includes('contacts')) {
    for (const role of ['principal', 'correspondent', 'accountant'] as const) {
      const c = f[role]
      if ((c.mobile.trim() || c.email.trim()) && c.name.trim().length < 2) return `Enter the ${role}'s name`
    }
  }
  const res = schoolDetailsSchema.safeParse(toInput(f))
  if (res.success) return ''
  const keys = sections.flatMap(s => SECTION_KEYS[s])
  const issue = res.error.issues.find(i => keys.includes(String(i.path[0])))
  if (!issue) return ''
  if (issue.code === 'invalid_type' || issue.message.startsWith('Invalid')) {
    const k = String(issue.path[issue.path.length - 1])
    return k === 'approxStudents' ? 'Enter the approximate number of students' : k === 'approxStaff' ? 'Enter the approximate number of staff' : `Check “${k}”`
  }
  return issue.message
}

const field = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-purple-300'
const label = 'block text-sm font-medium text-gray-700 mb-1'

export default function SchoolDetailsFields({ value: f, onChange, sections, owners }: {
  value: DetailsForm; onChange: (f: DetailsForm) => void; sections: Section[]; owners?: { id: number; name: string }[]
}) {
  const set = <K extends keyof DetailsForm>(k: K, v: DetailsForm[K]) => onChange({ ...f, [k]: v })
  const setP = (role: 'principal' | 'correspondent' | 'accountant', k: 'name' | 'mobile' | 'email', v: string) => onChange({ ...f, [role]: { ...f[role], [k]: v } })
  const input = (k: keyof DetailsForm, lbl: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label className={label} htmlFor={`sd-${k}`}>{lbl}</label>
      <input id={`sd-${k}`} data-testid={`sd-${k}`} value={f[k] as string} onChange={e => set(k, e.target.value as never)} className={field} {...props} /></div>
  )
  const has = (s: Section) => sections.includes(s)
  return (
    <div className="space-y-4" data-testid="school-details-fields">
      {has('school') && <fieldset className="space-y-3"><legend className="text-sm font-semibold text-gray-800 mb-1">Legal entity & address</legend>
        <div className="grid sm:grid-cols-[1fr_10rem] gap-3">
          {input('legalName', 'Legal name * (on the invoice)', { placeholder: 'e.g. Sri Vidya Educational Trust' })}
          <div><label className={label} htmlFor="sd-entityType">Entity type *</label>
            <select id="sd-entityType" data-testid="sd-entityType" value={f.entityType} onChange={e => set('entityType', e.target.value)} className={field}>
              {ENTITY_TYPES.map(t => <option key={t} value={t}>{ENTITY_LABEL[t]}</option>)}</select></div>
        </div>
        {input('address', 'Address *', { placeholder: 'Door no., street, area' })}
        <div className="grid sm:grid-cols-3 gap-3">
          {input('city', 'City *')}
          <div><label className={label} htmlFor="sd-stateCode">State *</label>
            <select id="sd-stateCode" data-testid="sd-stateCode" value={f.stateCode} onChange={e => set('stateCode', e.target.value)} className={field}>
              <option value="">Choose…</option>{INDIAN_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}</select></div>
          {input('pin', 'PIN code *', { inputMode: 'numeric', maxLength: 6 })}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {input('phone', 'School office phone')}
          {input('website', 'Website', { placeholder: 'www.school.in' })}
        </div>
      </fieldset>}

      {has('tax') && <fieldset className="space-y-3"><legend className="text-sm font-semibold text-gray-800 mb-1">Tax details (optional)</legend>
        <div className="grid sm:grid-cols-2 gap-3">
          {input('gstin', 'GSTIN', { maxLength: 15, placeholder: '36ABCDE1234F1Z5', onChange: e => set('gstin', e.target.value.toUpperCase()) })}
          {input('pan', 'PAN', { maxLength: 10, placeholder: 'ABCDE1234F', onChange: e => set('pan', e.target.value.toUpperCase()) })}
        </div>
        <p className="text-xs text-muted-foreground">With a GSTIN on the invoice the school can claim the GST. Most schools are not registered — leave blank.</p>
      </fieldset>}

      {has('profile') && <fieldset className="space-y-3"><legend className="text-sm font-semibold text-gray-800 mb-1">School profile</legend>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={label} htmlFor="sd-board">Board *</label>
            <select id="sd-board" data-testid="sd-board" value={f.board} onChange={e => set('board', e.target.value)} className={field}>{BOARDS.map(b => <option key={b}>{b}</option>)}</select></div>
          <div><label className={label} htmlFor="sd-medium">Medium *</label>
            <select id="sd-medium" value={f.medium} onChange={e => set('medium', e.target.value)} className={field}>{MEDIUMS.map(m => <option key={m}>{m}</option>)}</select></div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div><label className={label} htmlFor="sd-cf">Classes from *</label>
            <select id="sd-cf" data-testid="sd-classesFrom" value={f.classesFrom} onChange={e => set('classesFrom', e.target.value)} className={field}>{GRADE_SEQUENCE.map(g => <option key={g}>{g}</option>)}</select></div>
          <div><label className={label} htmlFor="sd-ct">Classes to *</label>
            <select id="sd-ct" data-testid="sd-classesTo" value={f.classesTo} onChange={e => set('classesTo', e.target.value)} className={field}>{GRADE_SEQUENCE.map(g => <option key={g}>{g}</option>)}</select></div>
          <div><label className={label} htmlFor="sd-month">Academic year starts *</label>
            <select id="sd-month" data-testid="sd-academicStartMonth" value={f.academicStartMonth} onChange={e => set('academicStartMonth', e.target.value)} className={field}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {input('udiseCode', 'UDISE+ code')}
          {input('affiliationNo', 'Affiliation no.')}
        </div>
      </fieldset>}

      {has('contacts') && <fieldset className="space-y-3"><legend className="text-sm font-semibold text-gray-800 mb-1">Other contacts</legend>
        <p className="text-xs text-muted-foreground">The accountant gets bills, pay links and invoices; the principal and correspondent get the welcome and renewal notices.</p>
        {(['principal', 'correspondent', 'accountant'] as const).map(role => (
          <div key={role} className="grid sm:grid-cols-[8rem_1fr_9rem_1fr] gap-2 items-center" data-testid={`sd-contact-${role}`}>
            <span className="text-sm text-gray-700 capitalize">{role === 'correspondent' ? 'Correspondent / owner' : role}</span>
            <input aria-label={`${role} name`} data-testid={`sd-${role}-name`} value={f[role].name} onChange={e => setP(role, 'name', e.target.value)} placeholder="Name" className={field} />
            <input aria-label={`${role} mobile`} data-testid={`sd-${role}-mobile`} inputMode="numeric" value={f[role].mobile} onChange={e => setP(role, 'mobile', sanitizeMobileTyping(e.target.value))} placeholder="Mobile" className={field} />
            <input aria-label={`${role} email`} type="email" value={f[role].email} onChange={e => setP(role, 'email', e.target.value)} placeholder="Email" className={field} />
          </div>
        ))}
      </fieldset>}

      {has('size') && <fieldset className="space-y-3"><legend className="text-sm font-semibold text-gray-800 mb-1">Size & commercial</legend>
        <div className="grid sm:grid-cols-2 gap-3">
          {input('approxStudents', 'Approx. students *', { type: 'number', min: 1 })}
          {input('approxStaff', 'Approx. staff *', { type: 'number', min: 1 })}
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div><label className={label} htmlFor="sd-owner">WLYL contact (sales owner)</label>
            <select id="sd-owner" data-testid="sd-salesOwnerId" value={f.salesOwnerId} onChange={e => set('salesOwnerId', e.target.value)} className={field}>
              <option value="">—</option>{(owners ?? []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
          {input('referralSource', 'Referral / source', { placeholder: 'e.g. referral by another school' })}
          {input('goLiveDate', 'Target go-live', { type: 'date' })}
        </div>
        <div><label className={label} htmlFor="sd-notes">Notes</label>
          <textarea id="sd-notes" rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} className={`${field} resize-none`} /></div>
      </fieldset>}

      {has('needs') && <fieldset className="space-y-2"><legend className="text-sm font-semibold text-gray-800 mb-1">What the school needs</legend>
        {([['portals', 'Parent & student portals'], ['whatsapp', 'WhatsApp messages to parents / staff'], ['dataImport', 'Help importing existing data (Excel)']] as const).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" data-testid={`sd-need-${k}`} checked={f[k]} onChange={e => set(k, e.target.checked)} /> {l}
          </label>
        ))}
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700"><span>Online fee collection:</span>
          {(['yes', 'later', 'no'] as const).map(v => (
            <label key={v} className="flex items-center gap-1"><input type="radio" name="sd-onlineFees" data-testid={`sd-onlineFees-${v}`} checked={f.onlineFees === v} onChange={() => set('onlineFees', v)} />{v === 'yes' ? 'Yes' : v === 'later' ? 'Later' : 'No'}</label>
          ))}</div>
      </fieldset>}
    </div>
  )
}
