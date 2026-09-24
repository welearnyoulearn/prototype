import { Fraunces } from 'next/font/google'

// Same display face AuthShell uses for the login screens — reused here so
// the Rewards panel reads as "this app has a designed identity," not a
// generic system-font dashboard tile. Scoped locally via .variable rather
// than touching the global font stack.
export const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-rewards-display',
})
