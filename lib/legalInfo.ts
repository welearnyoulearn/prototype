// Company details shown on the public policy pages (/terms, /privacy, /refund-policy, /contact, /pricing).
// The BILLING_* values are the same ones printed on tax invoices (lib/bills.ts), so they are set once.
// Anything not set shows as a visible [placeholder] — fill every one before the pages go live.
export type LegalInfo = {
  brand: string
  legalName: string
  address: string
  gstin: string
  email: string
  phone: string
  grievanceOfficer: string
  grievanceEmail: string
  jurisdictionCity: string
  effectiveDate: string
  hasGstin: boolean   // false until WLYL is GST-registered: the GSTIN line is then left out, not shown as a placeholder
}

const v = (key: string, placeholder: string) => process.env[key]?.trim() || `[${placeholder}]`

// The version of the Terms, Refund Policy and Privacy Policy a school accepts on the pay page. Changing
// LEGAL_EFFECTIVE_DATE (when the documents change) makes every school accept again on its next payment.
export const legalVersion = () => process.env.LEGAL_EFFECTIVE_DATE?.trim() || '2026-10-22'

export function legalInfo(): LegalInfo {
  return {
    brand: 'WeLearnYouLearn',
    legalName: v('BILLING_LEGAL_NAME', 'Registered company name'),
    address: v('BILLING_ADDRESS', 'Registered office address'),
    gstin: v('BILLING_GSTIN', 'GSTIN'),
    email: v('LEGAL_CONTACT_EMAIL', 'support email'),
    phone: v('LEGAL_CONTACT_PHONE', 'support phone'),
    grievanceOfficer: v('LEGAL_GRIEVANCE_OFFICER', 'Grievance Officer name'),
    grievanceEmail: v('LEGAL_GRIEVANCE_EMAIL', 'grievance email'),
    jurisdictionCity: v('LEGAL_JURISDICTION_CITY', 'city'),
    effectiveDate: v('LEGAL_EFFECTIVE_DATE', 'effective date'),
    hasGstin: !!process.env.BILLING_GSTIN?.trim(),
  }
}
