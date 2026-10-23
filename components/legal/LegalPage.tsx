import Link from 'next/link'
import type { ReactNode } from 'react'
import { legalInfo } from '@/lib/legalInfo'

// Shared shell for the public policy pages: brand, links between the pages, effective date, contact.
const PAGES = [
  { href: '/terms', label: 'Terms & Conditions' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/refund-policy', label: 'Refund & Cancellation' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/contact', label: 'Contact Us' },
]

export default function LegalPage({ title, current, children }: { title: string; current: string; children: ReactNode }) {
  const info = legalInfo()
  return (
    <div className="min-h-screen bg-[#f7f5f0] text-[#202a25]" data-testid="legal-page">
      <header className="border-b border-[#dce2db] bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link href="/" className="text-base font-semibold tracking-tight">{info.brand}</Link>
          <nav aria-label="Policies" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {PAGES.map(p => (
              <Link key={p.href} href={p.href} aria-current={p.href === current ? 'page' : undefined} data-testid={`legal-nav-${p.href.slice(1)}`}
                className={p.href === current ? 'font-semibold text-[#245b46]' : 'text-[#52514e] hover:text-[#245b46]'}>{p.label}</Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-[#626e66]">Effective {info.effectiveDate} · {info.legalName}</p>
        <div className="legal-body mt-8 space-y-6 text-[15px] leading-7 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol>li]:list-decimal [&_table]:w-full [&_td]:border-t [&_td]:border-[#e1e0d9] [&_td]:py-2 [&_td]:pr-4 [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:text-sm [&_th]:text-[#626e66] [&_a]:text-[#245b46] [&_a]:underline">
          {children}
        </div>
      </main>
      <footer className="border-t border-[#dce2db] bg-white">
        <div className="mx-auto max-w-4xl px-4 py-6 text-sm text-[#626e66]">
          <p>{info.brand} is operated by {info.legalName}{info.address && ` · ${info.address}`}{info.hasGstin ? ` · GSTIN ${info.gstin}` : ''}</p>
          <p className="mt-1">Questions: <a className="underline" href={`mailto:${info.email}`}>{info.email}</a> · {info.phone}</p>
        </div>
      </footer>
    </div>
  )
}
