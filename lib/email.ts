import { Resend } from 'resend'

const FROM = process.env.EMAIL_FROM || 'WLYL Team <admin@welearnyoulearn.com>'

export async function sendMail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — skipping')
    return
  }
  const resend = new Resend(apiKey)
  console.log(`[email] Sending to ${to} via Resend`)
  const { data, error } = await resend.emails.send({ from: FROM, to, subject, html })
  if (error) throw new Error(error.message)
  console.log(`[email] Sent OK — id: ${data?.id}`)
  return data
}

// ─── Shared base template ─────────────────────────────────────────────────────
function baseTemplate(accentColor: string, content: { header: string; body: string }): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;padding:24px 16px}
  .wrap{max-width:560px;margin:0 auto}
  .card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.09)}
  .header{background:${accentColor};padding:32px 36px}
  .header-logo{display:flex;align-items:center;gap:12px;margin-bottom:20px}
  .logo-mark{width:40px;height:40px;background:rgba(255,255,255,.2);border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;color:#fff}
  .logo-name{font-size:16px;font-weight:700;color:#fff;letter-spacing:.5px}
  .logo-sub{font-size:11px;color:rgba(255,255,255,.7);margin-top:1px}
  .header h1{font-size:22px;font-weight:700;color:#fff;margin-bottom:4px}
  .header p{font-size:13px;color:rgba(255,255,255,.75)}
  .body{padding:32px 36px}
  .greeting{font-size:15px;color:#374151;margin-bottom:20px;line-height:1.6}
  .cred-box{background:#fffbeb;border:1.5px solid #fde68a;border-radius:12px;padding:20px 24px;margin:20px 0}
  .cred-title{font-size:11px;font-weight:700;color:#92400e;letter-spacing:.8px;text-transform:uppercase;margin-bottom:14px}
  .cred-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #fef3c7}
  .cred-row:last-child{border-bottom:none}
  .cred-label{font-size:13px;color:#78350f}
  .cred-value{font-family:'Courier New',monospace;font-size:14px;font-weight:700;color:#92400e;background:#fff;padding:3px 10px;border-radius:6px;border:1px solid #fde68a}
  .warning-box{background:#fff7ed;border:1.5px solid #fed7aa;border-radius:10px;padding:14px 18px;margin:16px 0;font-size:13px;color:#9a3412;line-height:1.5}
  .btn{display:inline-block;background:${accentColor};color:#fff!important;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:14px;font-weight:600;margin:20px 0;letter-spacing:.3px}
  .info-box{background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:12px;padding:18px 22px;margin:16px 0}
  .info-row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-bottom:1px solid #e0f2fe}
  .info-row:last-child{border-bottom:none}
  .info-label{color:#6b7280}
  .info-value{font-weight:600;color:#0c4a6e}
  .steps{margin:16px 0;padding-left:0;list-style:none;counter-reset:steps}
  .steps li{counter-increment:steps;display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;line-height:1.5}
  .steps li:last-child{border-bottom:none}
  .steps li::before{content:counter(steps);flex-shrink:0;width:24px;height:24px;background:${accentColor};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;margin-top:1px}
  .footer{background:#f9fafb;border-top:1px solid #e5e7eb;padding:18px 36px;text-align:center;font-size:12px;color:#9ca3af;line-height:1.6}
  .divider{height:1px;background:#f3f4f6;margin:20px 0}
</style></head>
<body>
<div class="wrap">
<div class="card">
  <div class="header">
    <div class="header-logo">
      <div class="logo-mark">W</div>
      <div><div class="logo-name">WLYL</div><div class="logo-sub">We Learn, You Lead</div></div>
    </div>
    ${content.header}
  </div>
  <div class="body">${content.body}</div>
  <div class="footer">© ${new Date().getFullYear()} WLYL Team &nbsp;·&nbsp; This is an automated email — please do not reply directly.<br/>For support, contact <a href="mailto:support@welearnyoulearn.com" style="color:#6b7280">support@welearnyoulearn.com</a></div>
</div>
</div>
</body></html>`
}

function template(accentColor: string, header: string, body: string): string {
  return baseTemplate(accentColor, { header, body })
}

// ─── 1. School Admin onboarding ───────────────────────────────────────────────
export async function sendOnboardingEmail(params: {
  to: string; schoolName: string; schoolCode: string; tempPassword: string; loginUrl: string
}) {
  const html = template('#2563eb',
    `<h1>Welcome to WLYL!</h1><p>Your school has been successfully onboarded.</p>`,
    `<p class="greeting">Hi there! <strong>${params.schoolName}</strong> is now live on the WLYL platform. Use the credentials below to access your school admin dashboard.</p>
    <div class="cred-box">
      <div class="cred-title">Your Login Credentials</div>
      <div class="cred-row"><span class="cred-label">School ID</span><span class="cred-value">${params.schoolCode}</span></div>
      <div class="cred-row"><span class="cred-label">Temporary Password</span><span class="cred-value">${params.tempPassword}</span></div>
      <div class="cred-row"><span class="cred-label">Login URL</span><span class="cred-value" style="font-size:12px">${params.loginUrl}</span></div>
    </div>
    <div class="warning-box">⚠️ This is a temporary password. You will be required to set a new password on your first login.</div>
    <a href="${params.loginUrl}" class="btn">Access School Dashboard →</a>
    <ol class="steps">
      <li>Click the button above or visit the login URL</li>
      <li>Enter your School ID and the temporary password above</li>
      <li>Set a new secure password when prompted</li>
      <li>Complete your profile setup and start managing your school</li>
    </ol>`)
  return sendMail(params.to, `Welcome to WLYL — ${params.schoolName} Successfully Onboarded!`, html)
}

// ─── 2. Teacher welcome ───────────────────────────────────────────────────────
export async function sendTeacherWelcomeEmail(params: {
  to: string; name: string; schoolName: string; tempPassword: string; loginUrl: string
}) {
  const html = template('#059669',
    `<h1>Welcome to ${params.schoolName}!</h1><p>Your teacher account is ready on WLYL.</p>`,
    `<p class="greeting">Hi <strong>${params.name}</strong>, your teacher account has been created on the WLYL platform for <strong>${params.schoolName}</strong>. Use the details below to log in.</p>
    <div class="cred-box">
      <div class="cred-title">Your Login Credentials</div>
      <div class="cred-row"><span class="cred-label">Email</span><span class="cred-value">${params.to}</span></div>
      <div class="cred-row"><span class="cred-label">Temporary Password</span><span class="cred-value">${params.tempPassword}</span></div>
    </div>
    <div class="warning-box">⚠️ This is a one-time temporary password. You will be asked to change it immediately after your first login.</div>
    <a href="${params.loginUrl}" class="btn">Log In as Teacher →</a>
    <ol class="steps">
      <li>Visit your teacher portal using the button above</li>
      <li>Enter your email address and the temporary password</li>
      <li>Create a strong new password when prompted</li>
      <li>Explore your classes, timetable, tasks, and more</li>
    </ol>`)
  return sendMail(params.to, `Your WLYL Teacher Account — ${params.schoolName}`, html)
}

// ─── 3. Student welcome ───────────────────────────────────────────────────────
export async function sendStudentWelcomeEmail(params: {
  to: string; name: string; schoolName: string; rollNumber: string; tempPassword: string; loginUrl: string
}) {
  const html = template('#f97316',
    `<h1>Welcome, ${params.name}!</h1><p>Your student account on WLYL is ready.</p>`,
    `<p class="greeting">Hi <strong>${params.name}</strong>! Your student account has been created on the WLYL learning platform for <strong>${params.schoolName}</strong>.</p>
    <div class="cred-box">
      <div class="cred-title">Your Login Details</div>
      <div class="cred-row"><span class="cred-label">Roll Number</span><span class="cred-value">${params.rollNumber}</span></div>
      <div class="cred-row"><span class="cred-label">Temporary Password</span><span class="cred-value">${params.tempPassword}</span></div>
    </div>
    <div class="warning-box">⚠️ Please change this password after your first login to keep your account safe.</div>
    <a href="${params.loginUrl}" class="btn">Open Student Portal →</a>
    <ol class="steps">
      <li>Visit your student portal using the button above</li>
      <li>Enter your Roll Number and the temporary password</li>
      <li>Set a new password of your choice</li>
      <li>Start learning — check your tasks, timetable, and daily knowledge!</li>
    </ol>`)
  return sendMail(params.to, `Welcome to WLYL — ${params.schoolName}`, html)
}

// ─── 3b. Child's student-portal credentials, sent to the parent ──────────────
// Distinct from sendParentWelcomeEmail below — that one is about the parent's
// OWN portal account. This one hands the parent a copy of their CHILD's
// student-portal login (roll number + password), sent to the parent's own
// address so the credentials aren't only reachable through a child's inbox
// they may not check. Sent alongside the student's own welcome email
// whenever the student has a linked parent with an email on file, regardless
// of whether the student also has their own email — parents commonly manage
// a young child's login anyway.
export async function sendChildCredentialsToParentEmail(params: {
  to: string; parentName: string; studentName: string; schoolName: string
  rollNumber: string; tempPassword: string; loginUrl: string
}) {
  const html = template('#f97316',
    `<h1>${params.studentName}'s Student Login</h1><p>Credentials for their WLYL student account.</p>`,
    `<p class="greeting">Hi <strong>${params.parentName}</strong>! Here are <strong>${params.studentName}</strong>'s login details for the WLYL student portal at <strong>${params.schoolName}</strong> — useful to keep on hand, since many families share one login between parent and child.</p>
    <div class="cred-box">
      <div class="cred-title">${params.studentName}'s Login Details</div>
      <div class="cred-row"><span class="cred-label">Roll Number</span><span class="cred-value">${params.rollNumber}</span></div>
      <div class="cred-row"><span class="cred-label">Temporary Password</span><span class="cred-value">${params.tempPassword}</span></div>
    </div>
    <div class="warning-box">⚠️ This password should be changed after the first login to keep the account safe.</div>
    <a href="${params.loginUrl}" class="btn">Open Student Portal →</a>`)
  return sendMail(params.to, `${params.studentName}'s Student Login — ${params.schoolName}`, html)
}

// ─── 4. Parent welcome ────────────────────────────────────────────────────────
export async function sendParentWelcomeEmail(params: {
  to: string; parentName: string; studentName: string; schoolName: string; tempPassword: string; loginUrl: string
}) {
  const html = template('#0d9488',
    `<h1>Track ${params.studentName}'s Progress</h1><p>Your parent account on WLYL is ready.</p>`,
    `<p class="greeting">Hi <strong>${params.parentName}</strong>! A parent account has been created for you on the WLYL platform so you can track <strong>${params.studentName}</strong>'s academic progress at <strong>${params.schoolName}</strong>.</p>
    <div class="cred-box">
      <div class="cred-title">Your Login Credentials</div>
      <div class="cred-row"><span class="cred-label">Email</span><span class="cred-value">${params.to}</span></div>
      <div class="cred-row"><span class="cred-label">Temporary Password</span><span class="cred-value">${params.tempPassword}</span></div>
    </div>
    <div class="warning-box">⚠️ This is a temporary password. You will be asked to set a new one on your first login.</div>
    <a href="${params.loginUrl}" class="btn">Open Parent Portal →</a>
    <div class="info-box" style="margin-top:20px">
      <div style="font-size:12px;font-weight:700;color:#0e7490;letter-spacing:.6px;text-transform:uppercase;margin-bottom:10px">What you can see</div>
      <div class="info-row"><span class="info-label">Exam results & report cards</span><span class="info-value">✓</span></div>
      <div class="info-row"><span class="info-label">Attendance records</span><span class="info-value">✓</span></div>
      <div class="info-row"><span class="info-label">Fee status & payments</span><span class="info-value">✓</span></div>
      <div class="info-row"><span class="info-label">Homework & task submissions</span><span class="info-value">✓</span></div>
      <div class="info-row"><span class="info-label">Timetable & announcements</span><span class="info-value">✓</span></div>
    </div>`)
  return sendMail(params.to, `Your WLYL Parent Account — ${params.schoolName}`, html)
}

// ─── 5. Password reset (all roles) ───────────────────────────────────────────
export async function sendPasswordResetEmail(params: {
  to: string; name: string; resetUrl: string; role?: string
}) {
  const roleLabel = params.role === 'teacher' ? 'Teacher' : params.role === 'student' ? 'Student' : params.role === 'parent' ? 'Parent' : 'Admin'
  const accent = params.role === 'teacher' ? '#059669' : params.role === 'student' ? '#f97316' : params.role === 'parent' ? '#0d9488' : '#2563eb'
  const html = template(accent,
    `<h1>Reset Your Password</h1><p>WLYL ${roleLabel} Portal</p>`,
    `<p class="greeting">Hi <strong>${params.name}</strong>, we received a request to reset your WLYL password. Click the button below — this link is valid for <strong>1 hour</strong>.</p>
    <a href="${params.resetUrl}" class="btn">Reset My Password →</a>
    <div class="warning-box">If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.</div>
    <div class="divider"></div>
    <p style="font-size:12px;color:#9ca3af">If the button doesn't work, copy and paste this link into your browser:<br/><span style="color:#6b7280;word-break:break-all">${params.resetUrl}</span></p>`)
  return sendMail(params.to, 'WLYL — Password Reset Request', html)
}

// ─── 6. Plan activation ───────────────────────────────────────────────────────
const PLAN_PRICES: Record<string, number> = { basic: 9999, standard: 24999, premium: 49999 }

export async function sendPlanActivationEmail(params: {
  to: string; schoolName: string; schoolCode: string; tier: string; startDate: string; endDate: string
}) {
  const amount = PLAN_PRICES[params.tier.toLowerCase()] || 0
  const tierLabel = params.tier.charAt(0).toUpperCase() + params.tier.slice(1)
  const html = template('#7c3aed',
    `<h1>${tierLabel} Plan Activated</h1><p>Subscription details for ${params.schoolName}</p>`,
    `<p class="greeting">Your <strong>${tierLabel} Plan</strong> has been activated for <strong>${params.schoolName}</strong>. Here are your subscription details:</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">School</span><span class="info-value">${params.schoolName}</span></div>
      <div class="info-row"><span class="info-label">School ID</span><span class="info-value">${params.schoolCode}</span></div>
      <div class="info-row"><span class="info-label">Plan</span><span class="info-value">${tierLabel}</span></div>
      <div class="info-row"><span class="info-label">Valid From</span><span class="info-value">${params.startDate}</span></div>
      <div class="info-row"><span class="info-label">Valid Until</span><span class="info-value">${params.endDate}</span></div>
      <div class="info-row"><span class="info-label">Annual Amount</span><span class="info-value" style="color:#7c3aed;font-size:15px">₹${amount.toLocaleString('en-IN')}</span></div>
    </div>
    <p style="font-size:13px;color:#6b7280;margin-top:16px">Your plan is valid for 1 year. A renewal reminder will be sent 30 days before expiry.</p>`)
  return sendMail(params.to, `WLYL — ${tierLabel} Plan Activated for ${params.schoolName}`, html)
}

// ─── 7. Fee payment confirmed ─────────────────────────────────────────────────
export async function sendFeePaymentConfirmedEmail(params: {
  to: string; parentName: string; studentName: string; schoolName: string
  receiptNumber: string; amount: number; categoryName: string; periodLabel: string
  paymentMode: string; paidDate: string; verifiedBy: string
}) {
  const modeLabel: Record<string, string> = { cash: 'Cash', cheque: 'Cheque', dd: 'Demand Draft', upi: 'UPI', online: 'Online Transfer' }
  const html = template('#059669',
    `<h1>Payment Confirmed</h1><p>${params.schoolName}</p>`,
    `<p class="greeting">Dear <strong>${params.parentName}</strong>, the fee payment for <strong>${params.studentName}</strong> has been confirmed. Here are the details:</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Receipt Number</span><span class="info-value" style="font-family:monospace">${params.receiptNumber}</span></div>
      <div class="info-row"><span class="info-label">Fee Category</span><span class="info-value">${params.categoryName}</span></div>
      <div class="info-row"><span class="info-label">Period</span><span class="info-value">${params.periodLabel}</span></div>
      <div class="info-row"><span class="info-label">Amount Paid</span><span class="info-value" style="color:#059669;font-size:16px">₹${params.amount.toLocaleString('en-IN')}</span></div>
      <div class="info-row"><span class="info-label">Payment Mode</span><span class="info-value">${modeLabel[params.paymentMode] || params.paymentMode}</span></div>
      <div class="info-row"><span class="info-label">Payment Date</span><span class="info-value">${params.paidDate}</span></div>
      <div class="info-row"><span class="info-label">Verified By</span><span class="info-value">${params.verifiedBy}</span></div>
    </div>
    <p style="font-size:13px;color:#6b7280;margin-top:16px">Please keep this email as your payment confirmation. You can also view your receipt in the parent portal.</p>`)
  return sendMail(params.to, `Fee Payment Confirmed — ₹${params.amount.toLocaleString('en-IN')} · ${params.receiptNumber}`, html)
}

// ─── 8. Fee payment rejected ──────────────────────────────────────────────────
export async function sendFeePaymentRejectedEmail(params: {
  to: string; parentName: string; studentName: string; schoolName: string
  receiptNumber: string; amount: number; categoryName: string; periodLabel: string
  rejectionReason: string
}) {
  const html = template('#dc2626',
    `<h1>Payment Not Confirmed</h1><p>${params.schoolName}</p>`,
    `<p class="greeting">Dear <strong>${params.parentName}</strong>, unfortunately the fee payment submitted for <strong>${params.studentName}</strong> could not be verified.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Receipt Reference</span><span class="info-value" style="font-family:monospace">${params.receiptNumber}</span></div>
      <div class="info-row"><span class="info-label">Fee Category</span><span class="info-value">${params.categoryName}</span></div>
      <div class="info-row"><span class="info-label">Period</span><span class="info-value">${params.periodLabel}</span></div>
      <div class="info-row"><span class="info-label">Amount</span><span class="info-value">₹${params.amount.toLocaleString('en-IN')}</span></div>
    </div>
    <div class="warning-box">
      <strong>Reason:</strong> ${params.rejectionReason}
    </div>
    <p style="font-size:13px;color:#6b7280;margin-top:16px">Please contact the school office to resolve this or submit a new payment. The fee entry has been restored to pending status.</p>`)
  return sendMail(params.to, `Fee Payment Rejected — ${params.receiptNumber} · Action Required`, html)
}

// ─── 9. Fee overdue reminder ──────────────────────────────────────────────────
export async function sendFeeOverdueReminderEmail(params: {
  to: string; parentName: string; studentName: string; schoolName: string
  categoryName: string; periodLabel: string; amountDue: number; dueDate: string; daysOverdue: number
}) {
  const html = template('#f59e0b',
    `<h1>Fee Payment Overdue</h1><p>${params.schoolName}</p>`,
    `<p class="greeting">Dear <strong>${params.parentName}</strong>, this is a reminder that a fee payment for <strong>${params.studentName}</strong> is overdue.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Fee Category</span><span class="info-value">${params.categoryName}</span></div>
      <div class="info-row"><span class="info-label">Period</span><span class="info-value">${params.periodLabel}</span></div>
      <div class="info-row"><span class="info-label">Amount Due</span><span class="info-value" style="color:#dc2626;font-size:16px">₹${params.amountDue.toLocaleString('en-IN')}</span></div>
      <div class="info-row"><span class="info-label">Was Due On</span><span class="info-value">${params.dueDate}</span></div>
      <div class="info-row"><span class="info-label">Days Overdue</span><span class="info-value" style="color:#dc2626">${params.daysOverdue} days</span></div>
    </div>
    <div class="warning-box">Please pay as soon as possible to avoid any inconvenience. Log in to the parent portal to pay online.</div>`)
  return sendMail(params.to, `Fee Overdue — ${params.categoryName} · ${params.periodLabel} · ${params.schoolName}`, html)
}

// ─── 10. Student account deactivated — to the student ─────────────────────────
export async function sendStudentRemovedEmail(params: {
  to: string; name: string; schoolName: string
}) {
  const html = template('#6b7280',
    `<h1>Account Deactivated</h1><p>${params.schoolName}</p>`,
    `<p class="greeting">Hi <strong>${params.name}</strong>, your WLYL student account at <strong>${params.schoolName}</strong> has been deactivated by your school. You will no longer be able to log in.</p>
    <p style="font-size:13px;color:#6b7280">If you believe this is a mistake, please contact your school directly.</p>`)
  return sendMail(params.to, `Account Deactivated — ${params.schoolName}`, html)
}

// ─── 10b. Student account deactivated — to the parent ─────────────────────────
export async function sendParentStudentRemovedEmail(params: {
  to: string; parentName: string; studentName: string; schoolName: string
}) {
  const html = template('#6b7280',
    `<h1>Account Deactivated</h1><p>${params.schoolName}</p>`,
    `<p class="greeting">Hi <strong>${params.parentName}</strong>, ${params.studentName}'s WLYL student account at <strong>${params.schoolName}</strong> has been deactivated by the school. They will no longer be able to log in.</p>
    <p style="font-size:13px;color:#6b7280">If you believe this is a mistake, please contact the school directly.</p>`)
  return sendMail(params.to, `${params.studentName}'s Account Deactivated — ${params.schoolName}`, html)
}

// ─── 11. Staff account deactivated ─────────────────────────────────────────────
export async function sendStaffRemovedEmail(params: {
  to: string; name: string; schoolName: string
}) {
  const html = template('#6b7280',
    `<h1>Account Deactivated</h1><p>${params.schoolName}</p>`,
    `<p class="greeting">Hi <strong>${params.name}</strong>, your WLYL staff account at <strong>${params.schoolName}</strong> has been deactivated. You will no longer be able to log in.</p>
    <p style="font-size:13px;color:#6b7280">If you believe this is a mistake, please contact your school directly.</p>`)
  return sendMail(params.to, `Account Deactivated — ${params.schoolName}`, html)
}

// ─── 12. Staff account reactivated (new password issued) ──────────────────────
export async function sendStaffReactivatedEmail(params: {
  to: string; name: string; schoolName: string; tempPassword: string; loginUrl: string
}) {
  const html = template('#059669',
    `<h1>Welcome Back to ${params.schoolName}!</h1><p>Your WLYL staff account has been reactivated.</p>`,
    `<p class="greeting">Hi <strong>${params.name}</strong>, your WLYL staff account at <strong>${params.schoolName}</strong> has been reactivated with a new password.</p>
    <div class="cred-box">
      <div class="cred-title">Your Login Credentials</div>
      <div class="cred-row"><span class="cred-label">Email</span><span class="cred-value">${params.to}</span></div>
      <div class="cred-row"><span class="cred-label">Temporary Password</span><span class="cred-value">${params.tempPassword}</span></div>
    </div>
    <div class="warning-box">⚠️ This is a one-time temporary password. You will be asked to change it immediately after your first login.</div>
    <a href="${params.loginUrl}" class="btn">Log In as Teacher →</a>`)
  return sendMail(params.to, `Welcome Back — ${params.schoolName}`, html)
}

// ─── 13. Staff login (email/phone) changed by school admin ────────────────────
export async function sendStaffContactChangedEmail(params: {
  to: string; name: string; schoolName: string; field: 'email' | 'phone'; newValue: string
}) {
  const html = template('#2563eb',
    `<h1>Login Details Updated</h1><p>${params.schoolName}</p>`,
    `<p class="greeting">Hi <strong>${params.name}</strong>, your login ${params.field} at <strong>${params.schoolName}</strong> was changed to <strong>${params.newValue}</strong> by your school.</p>
    <p style="font-size:13px;color:#6b7280">Your password is unchanged — continue using it to log in with the updated ${params.field}. If you didn't expect this change, contact your school directly.</p>`)
  return sendMail(params.to, `Login Updated — ${params.schoolName}`, html)
}
