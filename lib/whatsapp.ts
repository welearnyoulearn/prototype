import pool from './db'
import { checkAllowance, recordUsage } from './usage'

// ─── WhatsApp messaging via Meta Cloud API ───────────────────────────────────
//
// One platform-owned number (WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID,
// optional WHATSAPP_API_VERSION / WHATSAPP_TEMPLATE_LANG) sends approved
// templates for every school. Each call: validates the template, normalises the
// phone, checks the school's 'whatsapp.message' allowance (login/password
// templates are exempt from the cap), sends, and writes one whatsapp_messages
// row with the final status (blocked / queued / sent / failed). Usage is
// recorded only when Meta accepts the message. If the env vars are unset the
// message is logged as 'queued' and not sent (local dev). Delivery/read updates
// arrive via app/api/whatsapp/webhook.

export type WhatsappTemplateName =
  | 'student_credentials'
  | 'parent_credentials'
  | 'staff_credentials'
  | 'staff_reactivated'
  | 'student_removed'
  | 'staff_removed'
  | 'contact_info_changed'
  | 'password_reset'

// Every template this scaffold knows about, with the exact params it expects.
// Keeping the param shape typed here means a future real-send implementation
// can validate params match Meta's approved template variables before sending.
export const WHATSAPP_TEMPLATES: Record<WhatsappTemplateName, { params: string[]; sampleBody: string }> = {
  student_credentials: {
    params: ['student_name', 'school_name', 'login', 'temp_password', 'login_url'],
    sampleBody: 'Hi {{student_name}}, your WLYL student account at {{school_name}} is ready.\nLogin: {{login}}\nPassword: {{temp_password}}\n{{login_url}}\nPlease change your password after first login.',
  },
  parent_credentials: {
    params: ['parent_name', 'student_name', 'school_name', 'login', 'temp_password', 'login_url'],
    sampleBody: 'Hi {{parent_name}}, {{student_name}}\'s WLYL student login at {{school_name}} is ready.\nLogin: {{login}}\nPassword: {{temp_password}}\n{{login_url}}',
  },
  staff_credentials: {
    params: ['staff_name', 'school_name', 'login', 'temp_password', 'login_url'],
    sampleBody: 'Hi {{staff_name}}, your WLYL staff account at {{school_name}} is ready.\nLogin: {{login}}\nPassword: {{temp_password}}\n{{login_url}}',
  },
  staff_reactivated: {
    params: ['staff_name', 'school_name', 'login', 'temp_password', 'login_url'],
    sampleBody: 'Hi {{staff_name}}, your WLYL staff account at {{school_name}} has been reactivated with a new password.\nLogin: {{login}}\nPassword: {{temp_password}}\n{{login_url}}',
  },
  student_removed: {
    params: ['student_name', 'school_name'],
    sampleBody: '{{student_name}}\'s WLYL student account at {{school_name}} has been deactivated.',
  },
  staff_removed: {
    params: ['staff_name', 'school_name'],
    sampleBody: '{{staff_name}}\'s WLYL staff account at {{school_name}} has been deactivated.',
  },
  contact_info_changed: {
    params: ['name', 'school_name', 'field', 'new_value'],
    sampleBody: 'Hi {{name}}, your login {{field}} at {{school_name}} was changed to {{new_value}} by your school. Your password is unchanged.',
  },
  password_reset: {
    params: ['name', 'reset_url'],
    sampleBody: 'Hi {{name}}, here\'s your WLYL password reset link: {{reset_url}}\nThis link expires in 1 hour. If you didn\'t request this, ignore this message.',
  },
}

export type WhatsappSendParams = {
  schoolId: number
  to: string
  templateName: WhatsappTemplateName
  templateParams: Record<string, string>
  recipientName?: string
  source?: string
}

// Login/password messages must always go out, even past the monthly cap.
const EXEMPT = new Set<WhatsappTemplateName>([
  'student_credentials', 'parent_credentials', 'staff_credentials',
  'staff_reactivated', 'password_reset', 'contact_info_changed',
])

// The audit row must never hold a usable password or reset link.
const SECRET_PARAMS = new Set(['temp_password', 'reset_url'])
function redact(params: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(params).map(([k, v]) => [k, SECRET_PARAMS.has(k) ? '[redacted]' : v]))
}

// Digits only, with country code; bare 10-digit numbers are Indian.
function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  return digits.length > 10 ? digits : null
}

type SendResult = { status: 'blocked' | 'queued' | 'sent' | 'failed'; providerMessageId: string | null; failureReason: string | null }

async function callMeta(to: string, templateName: WhatsappTemplateName, templateParams: Record<string, string>): Promise<SendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) {
    console.warn(`[whatsapp] (not configured — not sent) template=${templateName}`)
    return { status: 'queued', providerMessageId: null, failureReason: null }
  }
  const version = process.env.WHATSAPP_API_VERSION || 'v21.0'
  const fail = (reason: string): SendResult => ({ status: 'failed', providerMessageId: null, failureReason: reason.slice(0, 500) })
  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
          components: [{
            type: 'body',
            parameters: WHATSAPP_TEMPLATES[templateName].params.map(p => ({ type: 'text', text: templateParams[p] ?? '' })),
          }],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    })
    const body = await res.json().catch(() => null) as { messages?: { id?: string }[]; error?: { message?: string } } | null
    const id = body?.messages?.[0]?.id
    if (res.ok && id) return { status: 'sent', providerMessageId: id, failureReason: null }
    return fail(body?.error?.message || `HTTP ${res.status}`)
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

// Fire-and-forget, matching lib/email.ts's sendMail() shape — callers should
// .catch(console.error) the same way they already do for email. Never throws.
export async function sendWhatsappMessage(params: WhatsappSendParams): Promise<void> {
  const { schoolId, to, templateName, templateParams, recipientName } = params

  if (!WHATSAPP_TEMPLATES[templateName]) {
    console.error(`[whatsapp] Unknown template: ${templateName}`)
    return
  }

  try {
    const phone = normalisePhone(to)
    let result: SendResult
    if (!phone) {
      result = { status: 'failed', providerMessageId: null, failureReason: 'invalid_phone' }
    } else {
      const allowance = await checkAllowance(schoolId, 'whatsapp.message', 1, { exempt: EXEMPT.has(templateName) })
      result = allowance.allowed
        ? await callMeta(phone, templateName, templateParams)
        : { status: 'blocked', providerMessageId: null, failureReason: allowance.reason ?? 'limit_reached' }
    }

    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO whatsapp_messages
         (school_id, recipient_phone, recipient_name, message_type, template_name,
          template_params, provider, provider_message_id, status, failure_reason, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,'meta',$7,$8,$9,$10)
       RETURNING id`,
      [schoolId, (phone ?? to).slice(0, 20), recipientName || null, templateName, templateName,
       JSON.stringify(redact(templateParams)), result.providerMessageId, result.status, result.failureReason,
       result.status === 'sent' ? new Date() : null]
    )

    if (result.status === 'sent' && result.providerMessageId) {
      await recordUsage({
        schoolId,
        meterKey: 'whatsapp.message',
        quantity: 1,
        source: params.source ?? `whatsapp.${templateName}`,
        ref: { type: 'whatsapp_message', id: rows[0].id },
        idempotencyKey: `wa:${result.providerMessageId}`,
      })
    } else if (result.status !== 'queued') {
      console.error(`[whatsapp] ${result.status} template=${templateName} school=${schoolId} reason=${result.failureReason}`)
    }
  } catch (err) {
    console.error('[whatsapp] send failed:', err instanceof Error ? err.message : err)
  }
}
