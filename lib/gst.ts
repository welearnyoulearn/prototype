// GST on WLYL's invoices (DOCS/SCHOOL-ONBOARDING.md §3): a school in the same state as WLYL pays CGST 9% +
// SGST 9%; any other state pays IGST 18%. The state is the GST state code (first 2 digits of a GSTIN).
// Safe for the browser: no server-only imports.

export const INDIAN_STATES: { code: string; name: string }[] = [
  { code: '35', name: 'Andaman and Nicobar Islands' }, { code: '37', name: 'Andhra Pradesh' }, { code: '12', name: 'Arunachal Pradesh' },
  { code: '18', name: 'Assam' }, { code: '10', name: 'Bihar' }, { code: '04', name: 'Chandigarh' }, { code: '22', name: 'Chhattisgarh' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' }, { code: '07', name: 'Delhi' }, { code: '30', name: 'Goa' },
  { code: '24', name: 'Gujarat' }, { code: '06', name: 'Haryana' }, { code: '02', name: 'Himachal Pradesh' }, { code: '01', name: 'Jammu and Kashmir' },
  { code: '20', name: 'Jharkhand' }, { code: '29', name: 'Karnataka' }, { code: '32', name: 'Kerala' }, { code: '38', name: 'Ladakh' },
  { code: '31', name: 'Lakshadweep' }, { code: '23', name: 'Madhya Pradesh' }, { code: '27', name: 'Maharashtra' }, { code: '14', name: 'Manipur' },
  { code: '17', name: 'Meghalaya' }, { code: '15', name: 'Mizoram' }, { code: '13', name: 'Nagaland' }, { code: '21', name: 'Odisha' },
  { code: '34', name: 'Puducherry' }, { code: '03', name: 'Punjab' }, { code: '08', name: 'Rajasthan' }, { code: '11', name: 'Sikkim' },
  { code: '33', name: 'Tamil Nadu' }, { code: '36', name: 'Telangana' }, { code: '16', name: 'Tripura' }, { code: '09', name: 'Uttar Pradesh' },
  { code: '05', name: 'Uttarakhand' }, { code: '19', name: 'West Bengal' },
]
export const stateName = (code: string | null | undefined) => INDIAN_STATES.find(s => s.code === code)?.name ?? null

export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
export const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/
export const PIN_RE = /^[1-9]\d{5}$/

// '' when fine, else what is wrong. A GSTIN must belong to the school's state.
export function gstinProblem(gstin: string, stateCode: string | null): string {
  if (!GSTIN_RE.test(gstin)) return 'GSTIN must be 15 characters, like 36ABCDE1234F1Z5'
  if (stateCode && gstin.slice(0, 2) !== stateCode) return `This GSTIN is registered in ${stateName(gstin.slice(0, 2)) ?? 'another state'}, not ${stateName(stateCode) ?? 'the school’s state'}`
  return ''
}

export type GstSplit =
  | { kind: 'intra'; cgst: number; sgst: number }   // same state as WLYL
  | { kind: 'inter'; igst: number }                 // another state
  | { kind: 'unknown'; gst: number }                // school's state, or WLYL's, not known yet

// gst = the bill's total GST (18%). CGST and SGST are each half; an odd paisa goes to SGST.
export function gstSplit(gst: number, buyerStateCode: string | null | undefined, sellerStateCode: string | null | undefined): GstSplit {
  if (!buyerStateCode || !sellerStateCode) return { kind: 'unknown', gst }
  if (buyerStateCode !== sellerStateCode) return { kind: 'inter', igst: gst }
  const p = Math.round(gst * 100)
  const cgst = Math.floor(p / 2)
  return { kind: 'intra', cgst: cgst / 100, sgst: (p - cgst) / 100 }
}

// The lines to print for a bill's GST (email, PDF, pay page, bill drawers).
export function gstLines(split: GstSplit): { label: string; amount: number }[] {
  if (split.kind === 'intra') return [{ label: 'CGST 9%', amount: split.cgst }, { label: 'SGST 9%', amount: split.sgst }]
  if (split.kind === 'inter') return [{ label: 'IGST 18%', amount: split.igst }]
  return [{ label: 'GST 18%', amount: split.gst }]
}
