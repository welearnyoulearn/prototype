// Masks a contact so the forgot-password screen can say where a link went
// without exposing the full address or number.

export function maskEmail(email: string): string {
  const [local, domain] = email.trim().split('@')
  if (!local || !domain) return '****'
  return `${local[0]}****@${domain}`
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return '****'
  return `${'*'.repeat(Math.max(digits.length - 4, 4))}${digits.slice(-4)}`
}
