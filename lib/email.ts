import nodemailer from 'nodemailer'

// ─── Transporter (auto-detects Gmail vs custom SMTP) ─────────────────────���───
const emailHost = process.env.EMAIL_HOST || 'smtp.zoho.in'
const isGmail = emailHost.includes('gmail')

const transporter = nodemailer.createTransport(
  isGmail
    ? {
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      }
    : {
        host: emailHost,
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: false, // STARTTLS on port 587
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      }
)

const FROM = process.env.EMAIL_FROM || `"WLYL Team" <${process.env.EMAIL_USER}>`

async function sendMail(to: string, subject: string, html: string) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('EMAIL_USER and EMAIL_PASS are not set in .env.local')
  }
  return transporter.sendMail({ from: FROM, to, subject, html })
}

// ─── Email Templates ──────────────────────────────────────────────────────────
function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 20px; }
  .card { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 28px 32px; }
  .header h1 { color: #fff; margin: 0; font-size: 22px; font-weight: 700; }
  .header p { color: #bfdbfe; margin: 4px 0 0; font-size: 13px; }
  .body { padding: 28px 32px; color: #374151; line-height: 1.6; }
  .body h2 { font-size: 17px; color: #111827; margin: 0 0 12px; }
  .info-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
  .info-box .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
  .info-box .label { color: #6b7280; }
  .info-box .value { color: #111827; font-weight: 600; }
  .credential-box { background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
  .credential-box .cred { font-size: 15px; padding: 4px 0; }
  .credential-box .cred .key { color: #92400e; }
  .credential-box .cred .val { font-family: monospace; font-size: 16px; color: #78350f; font-weight: 700; background: #fff; padding: 2px 8px; border-radius: 4px; border: 1px solid #fde68a; }
  .btn { display: inline-block; background: #2563eb; color: #fff !important; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; margin: 12px 0; }
  .warning { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #9a3412; margin: 12px 0; }
  .footer { padding: 16px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #9ca3af; }
</style></head>
<body>
  <div class="card">
    <div class="header">
      <h1>WLYL – We Learn, You Lead</h1>
      <p>School Management Platform</p>
    </div>
    <div class="body">${content}</div>
    <div class="footer">© ${new Date().getFullYear()} WLYL Team · This is an automated email, please do not reply.</div>
  </div>
</body>
</html>`
}

// ─── 1. School Onboarding Email ───────────────────────────────────────────────
export async function sendOnboardingEmail(params: {
  to: string
  schoolName: string
  schoolCode: string
  tempPassword: string
  loginUrl: string
}) {
  const html = baseTemplate(`
    <h2>Welcome to WLYL! 🎉</h2>
    <p>Congratulations! <strong>${params.schoolName}</strong> has been successfully onboarded onto the WLYL School Management Platform.</p>
    <p>Your school is now set up and ready to go. Use the credentials below to log in for the first time.</p>

    <div class="credential-box">
      <p style="margin:0 0 10px;font-size:13px;color:#92400e;font-weight:600;">YOUR LOGIN CREDENTIALS</p>
      <div class="cred"><span class="key">School ID: </span><span class="val">${params.schoolCode}</span></div>
      <div class="cred" style="margin-top:8px"><span class="key">Password:  </span><span class="val">${params.tempPassword}</span></div>
    </div>

    <div class="warning">
      ⚠️ This is a temporary password. You will be asked to change it on your first login.
    </div>

    <a href="${params.loginUrl}" class="btn">Log In to WLYL →</a>

    <p style="font-size:13px;color:#6b7280;margin-top:20px;">
      If you have any questions or need assistance, reach out to us at <a href="mailto:support@wlyl.com">support@wlyl.com</a>.
    </p>
    <p style="font-size:13px;color:#6b7280;">Warm regards,<br/><strong>The WLYL Team</strong></p>
  `)
  return sendMail(params.to, `Welcome to WLYL – ${params.schoolName} Successfully Onboarded!`, html)
}

// ─── 2. Plan Assignment / Billing Email ───────────────────────────────────────
const PLAN_PRICES: Record<string, number> = {
  basic: 9999,
  standard: 24999,
  premium: 49999,
}

export async function sendPlanActivationEmail(params: {
  to: string
  schoolName: string
  schoolCode: string
  tier: string
  startDate: string
  endDate: string
}) {
  const amount = PLAN_PRICES[params.tier.toLowerCase()] || 0
  const tierLabel = params.tier.charAt(0).toUpperCase() + params.tier.slice(1)

  const html = baseTemplate(`
    <h2>Plan Activated – ${tierLabel} Plan</h2>
    <p>Your <strong>${tierLabel} Plan</strong> has been activated for <strong>${params.schoolName}</strong>. Here are your subscription details:</p>

    <div class="info-box">
      <div class="row"><span class="label">School</span><span class="value">${params.schoolName}</span></div>
      <div class="row"><span class="label">School ID</span><span class="value">${params.schoolCode}</span></div>
      <div class="row"><span class="label">Plan</span><span class="value">${tierLabel}</span></div>
      <div class="row"><span class="label">Start Date</span><span class="value">${params.startDate}</span></div>
      <div class="row"><span class="label">End Date</span><span class="value">${params.endDate}</span></div>
      <div class="row" style="border-top:1px solid #bae6fd;margin-top:8px;padding-top:8px;">
        <span class="label">Annual Amount</span>
        <span class="value" style="color:#1d4ed8;font-size:16px;">₹${amount.toLocaleString('en-IN')}</span>
      </div>
    </div>

    <p style="font-size:13px;color:#6b7280;">
      Your plan is valid for 1 year from the activation date. You will receive a renewal reminder 30 days before expiry.
    </p>
    <p style="font-size:13px;color:#6b7280;">Warm regards,<br/><strong>The WLYL Team</strong></p>
  `)
  return sendMail(params.to, `WLYL – ${tierLabel} Plan Activated for ${params.schoolName}`, html)
}

// ─── 3. Forgot Password Email ─────────────────────────────────────────────────
export async function sendPasswordResetEmail(params: {
  to: string
  name: string
  resetUrl: string
}) {
  const html = baseTemplate(`
    <h2>Reset Your Password</h2>
    <p>Hi <strong>${params.name}</strong>,</p>
    <p>We received a request to reset your WLYL password. Click the button below to set a new password. This link is valid for <strong>1 hour</strong>.</p>

    <a href="${params.resetUrl}" class="btn">Reset Password →</a>

    <div class="warning">
      If you did not request a password reset, please ignore this email. Your password will remain unchanged.
    </div>

    <p style="font-size:13px;color:#6b7280;">Warm regards,<br/><strong>The WLYL Team</strong></p>
  `)
  return sendMail(params.to, 'WLYL – Password Reset Request', html)
}
