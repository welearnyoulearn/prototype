import pool from './db'

// ─── WhatsApp messaging — scaffold only, sending is NOT live yet ─────────────
//
// The DB schema (school_whatsapp_config, whatsapp_messages, whatsapp_usage_summary
// in lib/db.ts) already exists — this file is the application-code half: message
// templates, and a send function with the exact call shape the real Meta Cloud
// API integration will need. Every call here logs a row into whatsapp_messages
// with status='queued' and returns normally, but never actually reaches Meta's
// API — so onboarding/removal/reactivation flows can call sendWhatsappMessage()
// today, and the ONLY change needed when WhatsApp goes live is inside this one
// function (see the TODO block below). No call site anywhere else needs to
// change.
//
// To go live later:
//   1. Add WHATSAPP_ACCESS_TOKEN handling — decrypt school_whatsapp_config.access_token_encrypted
//      (see lib/encryption.ts pattern used for Cashfree secrets) instead of a shared env var,
//      since each school has its own Meta WABA + phone_number_id.
//   2. Replace the TODO block in sendWhatsappMessage() with a real fetch() to
//      https://graph.facebook.com/v20.0/{phone_number_id}/messages
//   3. Update the inserted whatsapp_messages row's status/provider_message_id from
//      the real API response instead of hardcoding 'queued'.
//   4. Wire the delivery-status webhook (Meta calls back with delivered/read
//      events) to UPDATE whatsapp_messages SET status=..., delivered_at=... —
//      not part of this scaffold.

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
}

// Fire-and-forget, matching lib/email.ts's sendMail() shape — callers should
// .catch(console.error) the same way they already do for email, never await
// this in a way that blocks the response.
export async function sendWhatsappMessage(params: WhatsappSendParams): Promise<void> {
  const { schoolId, to, templateName, templateParams, recipientName } = params

  const template = WHATSAPP_TEMPLATES[templateName]
  if (!template) {
    console.error(`[whatsapp] Unknown template: ${templateName}`)
    return
  }

  // ── TODO: replace this block with a real Meta Cloud API call when WhatsApp
  // integration goes live. Everything above and below this block (template
  // validation, the whatsapp_messages audit row) stays as-is.
  console.log(`[whatsapp] (scaffold — not sent) template=${templateName} to=${to} school=${schoolId}`)
  const status = 'queued'
  const providerMessageId: string | null = null
  // ── end TODO block

  try {
    await pool.query(
      `INSERT INTO whatsapp_messages
         (school_id, recipient_phone, recipient_name, message_type, template_name,
          template_params, provider, provider_message_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,'meta',$7,$8)`,
      [schoolId, to, recipientName || null, templateName, templateName,
       JSON.stringify(templateParams), providerMessageId, status]
    )
  } catch (err) {
    console.error('[whatsapp] Failed to log message audit row:', err)
  }
}

// ─── One-time codes (LIVE) ───────────────────────────────────────────────────
//
// Unlike the scaffold above, this really sends via Meta's WhatsApp Cloud API. It uses
// ONE platform-level sender (WLYL's own WhatsApp Business number, paid by WLYL) rather
// than each school's own account, because a verification code is a platform concern.
//
// Template: an Authentication-category template (default name `wlyl_parent_otp`, body
// "{{1}} is your verification code.", copy-code button). Meta fixes that body text, so
// the code is passed as the single body parameter AND the copy-code button parameter.
//
// Env: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN (required to send)
//      WHATSAPP_OTP_TEMPLATE (default wlyl_parent_otp), WHATSAPP_OTP_LANG (default en),
//      WHATSAPP_GRAPH_VERSION (default v21.0)
// See docs/WHATSAPP-SETUP.md.

export type WhatsappOtpResult =
  | { ok: true; mode: 'meta' | 'dev-console'; providerMessageId: string | null }
  | { ok: false; reason: string }

export function isWhatsappOtpConfigured(): boolean {
  return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN)
}

// The audit row must NEVER hold the code itself — it is a live credential for 5 minutes.
async function logOtpMessage(params: {
  schoolId: number | null; to: string; recipientName?: string | null; template: string
  status: 'queued' | 'sent' | 'failed'; providerMessageId: string | null; failureReason?: string
}): Promise<void> {
  if (params.schoolId == null) return // whatsapp_messages.school_id is NOT NULL
  try {
    await pool.query(
      `INSERT INTO whatsapp_messages
         (school_id, recipient_phone, recipient_name, message_type, template_name,
          template_params, provider, provider_message_id, status, failure_reason, sent_at)
       VALUES ($1,$2,$3,'parent_otp',$4,$5,'meta',$6,$7,$8,$9)`,
      [params.schoolId, params.to, params.recipientName || null, params.template,
       JSON.stringify({ code: '[redacted]' }), params.providerMessageId, params.status,
       params.failureReason ? params.failureReason.slice(0, 300) : null,
       params.status === 'sent' ? new Date() : null]
    )
  } catch (err) {
    console.error('[whatsapp] Failed to log OTP audit row:', err)
  }
}

export async function sendWhatsappOtp(params: {
  to: string            // canonical digits, e.g. 919876543210
  code: string
  schoolId: number | null
  recipientName?: string | null
}): Promise<WhatsappOtpResult> {
  const { to, code, schoolId, recipientName } = params
  const template = process.env.WHATSAPP_OTP_TEMPLATE || 'wlyl_parent_otp'

  if (!isWhatsappOtpConfigured()) {
    // Never print codes in production. In development this is the "no WhatsApp yet"
    // path: read the code from the server console.
    if (process.env.NODE_ENV === 'production') return { ok: false, reason: 'whatsapp_not_configured' }
    console.log(`[whatsapp:dev] OTP for +${to} is ${code} (WhatsApp not configured — not actually sent)`)
    await logOtpMessage({ schoolId, to, recipientName, template, status: 'queued', providerMessageId: null })
    return { ok: true, mode: 'dev-console', providerMessageId: null }
  }

  const url = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v21.0'}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_OTP_LANG || 'en' },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: code }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
          ],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    })
    const data = await res.json().catch(() => ({})) as {
      messages?: { id?: string }[]; error?: { message?: string; code?: number }
    }
    if (!res.ok) {
      const reason = data.error?.message || `HTTP ${res.status}`
      await logOtpMessage({ schoolId, to, recipientName, template, status: 'failed', providerMessageId: null, failureReason: reason })
      return { ok: false, reason }
    }
    const providerMessageId = data.messages?.[0]?.id ?? null
    await logOtpMessage({ schoolId, to, recipientName, template, status: 'sent', providerMessageId })
    return { ok: true, mode: 'meta', providerMessageId }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'send_failed'
    await logOtpMessage({ schoolId, to, recipientName, template, status: 'failed', providerMessageId: null, failureReason: reason })
    return { ok: false, reason }
  }
}
