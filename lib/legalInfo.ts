// Company details shown on the public policy pages (/terms, /privacy, /refund-policy, /contact, /pricing).
// The defaults below are WLYL's own details as registered with Cashfree (KYC), so the pages are correct
// on every deployment without any setup. An env var overrides a default (e.g. once WLYL is a company).
// The BILLING_* values are the same ones printed on tax invoices (lib/bills.ts).
export type LegalInfo = {
  brand: string
  legalName: string
  address: string     // '' until set: the address is then left out, not shown as a placeholder
  gstin: string
  email: string
  phone: string
  grievanceOfficer: string
  grievanceEmail: string
  jurisdictionCity: string   // '' until set: the Terms then name the courts of WLYL's registered office
  effectiveDate: string
  hasGstin: boolean   // false until WLYL is GST-registered: the GSTIN line is then left out, not shown as a placeholder
}

const DEFAULTS = {
  legalName: 'MANIKANTA KOWSIK PEDDAVARAPU',
  email: 'welearnyoulearn.in@gmail.com',
  phone: '+91 90147 60259',
}

const v = (key: string, fallback: string) => process.env[key]?.trim() || fallback

// The version of the Terms, Refund Policy and Privacy Policy a school accepts. Changing
// LEGAL_EFFECTIVE_DATE (when the documents change) makes every school accept again.
export const legalVersion = () => process.env.LEGAL_EFFECTIVE_DATE?.trim() || '2026-10-22'

export function legalInfo(): LegalInfo {
  const legalName = v('BILLING_LEGAL_NAME', DEFAULTS.legalName)
  const email = v('LEGAL_CONTACT_EMAIL', DEFAULTS.email)
  return {
    brand: 'WeLearnYouLearn',
    legalName,
    address: v('BILLING_ADDRESS', ''),
    gstin: v('BILLING_GSTIN', ''),
    email,
    phone: v('LEGAL_CONTACT_PHONE', DEFAULTS.phone),
    grievanceOfficer: v('LEGAL_GRIEVANCE_OFFICER', legalName),
    grievanceEmail: v('LEGAL_GRIEVANCE_EMAIL', email),
    jurisdictionCity: v('LEGAL_JURISDICTION_CITY', ''),
    effectiveDate: legalVersion(),
    hasGstin: !!process.env.BILLING_GSTIN?.trim(),
  }
}
