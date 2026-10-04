// The character-class rules every "set a password" screen checks live, and that
// lib/auth.ts's validateNewPassword enforces server-side — one definition, so the client
// checklist and the actual server check can never silently drift apart. Framework-agnostic
// (no Node-only imports), safe to import from both 'use client' components and lib/auth.ts.

export type PasswordRule = { label: string; test: (password: string) => boolean }

export const PASSWORD_RULES: PasswordRule[] = [
  { label: 'At least 8 characters', test: p => p.length >= 8 },
  { label: 'One uppercase letter',  test: p => /[A-Z]/.test(p) },
  { label: 'One lowercase letter',  test: p => /[a-z]/.test(p) },
  { label: 'One number',            test: p => /\d/.test(p) },
  { label: 'One symbol',            test: p => /[^A-Za-z0-9]/.test(p) },
]

/** True only when every rule passes — gates the submit button before the server even sees it. */
export function isPasswordStrong(password: string): boolean {
  return PASSWORD_RULES.every(r => r.test(password))
}
