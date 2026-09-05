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
