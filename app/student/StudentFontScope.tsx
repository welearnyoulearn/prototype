'use client'

import { useEffect, type ReactNode } from 'react'

// Radix dialogs and the phone nav drawer portal into <body>, outside this wrapper,
// so the student font variables are mirrored onto <body> while a student page is mounted.
export default function StudentFontScope({ className, children }: { className: string; children: ReactNode }) {
  useEffect(() => {
    const classes = className.split(' ').filter(Boolean)
    document.body.classList.add(...classes)
    return () => document.body.classList.remove(...classes)
  }, [className])

  return <div className={`${className} contents`}>{children}</div>
}
