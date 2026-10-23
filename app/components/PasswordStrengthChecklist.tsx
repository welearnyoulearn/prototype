'use client'

import { PASSWORD_RULES } from '@/lib/passwordPolicy'

// Live checklist shown under every "set a password" form — first login (student, teacher,
// parent, school admin) and voluntary changes alike use the same rules from lib/passwordPolicy,
// so this is the one place the checklist itself is drawn.
export default function PasswordStrengthChecklist({ password }: { password: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1.5" data-testid="password-strength-checklist">
      {PASSWORD_RULES.map(rule => {
        const ok = rule.test(password)
        return (
          <div key={rule.label} className={`flex items-center gap-2 text-xs transition ${ok ? 'text-green-600' : 'text-gray-400'}`}>
            {ok
              ? <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              : <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>}
            {rule.label}
          </div>
        )
      })}
    </div>
  )
}
