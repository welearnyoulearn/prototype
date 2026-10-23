# School onboarding — what we collect about a school

**Status:** built (branch `feature/school-onboarding-details`). It does not depend on WhatsApp or online payments; those come later on top of it.

## Why

Before this branch, Add School took only the name, city, address, phone and email. To manage a school, bill it correctly and keep the relationship easy, we also need:
- the legal entity and its State, for GST on bills;
- the right people to contact, including who pays the bills;
- the board, classes and academic year from day one.

## 1. Add School wizard (Platform Admin)

| Step | Fields (\* = required) | Used for |
|---|---|---|
| 1. School | Name\*, type, **legal entity name\***, **entity type** (trust / society / company / proprietor / government / other), address\*, city\*, **State\***, **PIN\***, office phone, website | "Bill to" on every bill; GST place of supply |
| 2. Tax (optional) | **GSTIN** (must belong to the chosen State), **PAN** | The school's GSTIN on its bills |
| 3. Profile | **Board\***, **medium\***, **classes run\*** (from–to), **academic year start month\*** (default **June** → 1 June – 31 May), UDISE+ code, affiliation no. | Classes and the academic year are created from it |
| 4. Contacts | **School admin\*** (name, email = login, mobile); principal, correspondent / owner, accountant (name, mobile, email) | **The accountant also gets every bill email and reminder** |
| 5. Size & needs | Approx. students\*, approx. staff\*, WLYL contact (sales owner), referral, target go-live, notes; needs (portals, WhatsApp, online fees, data import) | A warning if staff exceed the plan's limit; follow-ups |
| 6. Plan | Plan, or "No plan yet" | As before: the price, period and dates are set on the school's page |
| 7. Review | Everything at a glance | — |

The browser checks each step with the same rules as the server (`lib/schoolDetails.ts`):
- PIN is 6 digits.
- The GSTIN's state code matches the State.
- PAN is in the AAAAA9999A format.
- Classes are in order ("Classes to" is not before "Classes from").
- Mobiles are Indian.

**After "Create school":**
- The admin gets the usual set-password email.
- The **classes run** are created, one section **A** each.
- The **academic year** is created from the start month (June start → 1 June – 31 May).

**Scripts and older callers** of `POST /api/schools` that send only name, city, phone, email and address keep working exactly as before, with the April–March academic year and no details.

## 2. Platform Admin → school page → School details

- **Edit everything above** for any school. Older schools need this: without a State their bills show one "GST 18%" line, and a banner says so.
- **Setup checklist progress** is shown here too.
- **Every save is recorded** in the platform audit log.

## 3. GST on bills

- **WLYL's own state** comes from `BILLING_GSTIN` (first 2 digits), or `BILLING_STATE_CODE` before GST registration.
- **School in the same state:** **CGST 9% + SGST 9%**. **Another state:** **IGST 18%**. **State not known:** one "GST 18%" line.
- **Every new bill keeps its own "bill to"** (legal name, address with PIN, State, GSTIN), taken from the school when the bill is made. Later edits to the school never change a bill already made.
- **Where it shows:**
  - the bill email: the GST lines, plus "Bill to … · GSTIN … · Place of supply …";
  - Platform Admin → Billing → bill;
  - School → Settings → Plan & billing → Bills.

## 4. Setup checklist (school admin → Overview)

1. School logo and receipt header
2. Classes and sections (already created from "classes run")
3. Staff accounts
4. Students and parents
5. Fee structure

- **Each item ticks itself** when its data exists, and the card disappears once all five are done.
- **"Open"** takes the admin to the right screen.
- **It never breaks the page:** if the checklist can't be loaded, the card just doesn't show.

## 5. Public policy pages

- **Pages:** `/terms`, `/privacy`, `/refund-policy`, `/contact` and `/pricing` (plans read live), linked from the home page footer.
- **Company details come from settings:** `BILLING_LEGAL_NAME`, `BILLING_ADDRESS`, `BILLING_GSTIN`, `LEGAL_CONTACT_EMAIL`, `LEGAL_CONTACT_PHONE`, `LEGAL_GRIEVANCE_OFFICER`, `LEGAL_GRIEVANCE_EMAIL`, `LEGAL_JURISDICTION_CITY`, `LEGAL_EFFECTIVE_DATE`.
- **Until they are set**, each shows a visible [placeholder]. The GSTIN line is simply left out until WLYL has one.
- **Draft text:** it needs legal review before going live.

## 6. As built

| Piece | Where |
|---|---|
| Rules (browser + server) | `lib/schoolDetails.ts`; states, GSTIN check and GST split in `lib/gst.ts` |
| Save / load, academic year, classes | `lib/schoolProfile.ts` |
| Wizard | `app/platform-admin/components/AddSchoolWizard.tsx`, `components/school/SchoolDetailsFields.tsx`, `POST /api/schools` |
| School details panel | `app/platform-admin/components/SchoolDetailsPanel.tsx`, `GET/PUT /api/platform/schools/[id]/details` |
| Bills: bill-to, GST lines, accountant | `lib/bills.ts`, `lib/billingTypes.ts`, both bill screens |
| Checklist | `lib/setupChecklist.ts`, `GET /api/school/setup-checklist`, `app/school-admin/components/SetupChecklist.tsx` |
| Policy pages | `app/{terms,privacy,refund-policy,contact,pricing}`, `components/legal/LegalPage.tsx`, `lib/legalInfo.ts` |
| Schema | `SCHEMA_VERSION` 56: school detail columns, `school_contacts`, `saas_invoices.bill_to_*` |

**Tests:**
- `e2e/school-onboarding-details-ui.spec.ts`: the wizard with each step's checks, the School details panel, the checklist and the policy pages.
- `e2e/workflow-full-platform.spec.ts`: updated to the wizard.
- 7 database-level checks against the real code: the rules, the academic year, save/load, classes, the GST split, bill-to frozen, the accountant email, the checklist.
