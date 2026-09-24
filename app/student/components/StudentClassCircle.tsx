'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CakeSlice, Check, ChevronDown, Heart, UsersRound, X } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { StudentEmptyState, StudentPageIntro, studentReveal } from './StudentExperience'

type Wish = { wisherName: string; message: string; createdAt: string }
type Post = {
  id: number
  personId: number
  personName: string
  isOwnPost: boolean
  wishes: Wish[]
  wishedByMe: boolean
}

export default function StudentClassCircle() {
  const [posts, setPosts]     = useState<Post[] | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [wishing, setWishing]   = useState<number | null>(null)
  const [error, setError]       = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  const [justWished, setJustWished] = useState<number | null>(null)
  const reduceMotion = useReducedMotion()

  function load() {
    setLoadFailed(false)
    fetch('/api/student/class-circle')
      .then(r => r.ok ? r.json() : { posts: [] })
      .then(d => setPosts(d.posts ?? []))
      .catch(() => { setPosts([]); setLoadFailed(true) })
  }

  useEffect(() => { load() }, [])

  async function sendWish(postId: number) {
    setWishing(postId); setError('')
    try {
      const res = await fetch('/api/student/class-circle/wish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthday_post_id: postId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send wish')
      setJustWished(postId)
      window.setTimeout(() => setJustWished(current => current === postId ? null : current), 1200)
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send wish')
    } finally {
      setWishing(null)
    }
  }

  if (posts === null) {
    return (
      <div className="space-y-4" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Checking today’s Class Circle…</span>
        <Skeleton className="h-28 rounded-md" />
        <Skeleton className="h-32 rounded-md" />
        <Skeleton className="h-32 rounded-md" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-7">
      <StudentPageIntro eyebrow="Your class community" title="Class Circle" description="A small place to notice classmates and share a birthday wish when someone is celebrating." aside={
        <div className="flex items-center gap-2 text-xs font-medium text-[#6b756e]"><UsersRound size={17} className="text-[#a85f16]" aria-hidden="true" />Today in your grade</div>
      } />

      <AnimatePresence initial={false}>{error && (
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="bg-red-50 border-l-2 border-red-600 text-red-800 px-4 py-3 text-sm flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss error" className="grid h-10 w-10 place-items-center rounded-md hover:bg-red-100"><X size={16} aria-hidden="true" /></button>
        </motion.div>
      )}</AnimatePresence>

      {posts.length === 0 ? (
        loadFailed
          ? <StudentEmptyState icon={<UsersRound size={22} />} title="Class Circle is unavailable" description="We couldn’t check today’s class celebrations." action={{ label: 'Try again', onClick: load }} />
          : <StudentEmptyState icon={<CakeSlice size={22} />} title="No birthdays in your class today" description="Class Circle will show a celebration here when someone in your grade has a birthday." />
      ) : (
        <div className="student-list-surface divide-y divide-[#e4e0d7]">
          {posts.map((post, index) => {
            const isOpen = expanded === post.id
            const sent = post.wishedByMe || justWished === post.id
            return (
              <motion.div key={post.id} custom={index} variants={studentReveal} initial={reduceMotion ? false : 'hidden'} animate="visible" className={`student-list-row ${justWished === post.id ? 'student-success-flash' : ''}`}>
                <button
                  onClick={() => setExpanded(isOpen ? null : post.id)}
                  data-testid={`birthday-card-${post.id}`}
                  aria-expanded={isOpen} aria-controls={`birthday-wishes-${post.id}`}
                  className="w-full flex items-center gap-4 px-2 py-5 text-left sm:px-4"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#f1e2ca] text-[#8b4a10]" aria-hidden="true"><CakeSlice size={19} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[.1em] text-[#8a928c]">Celebrating today</p>
                    <p className="mt-1 text-sm font-semibold text-[#202a25]">{post.personName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {post.wishes.length} wish{post.wishes.length !== 1 ? 'es' : ''}
                    </p>
                  </div>
                  {sent && <span className="hidden items-center gap-1.5 text-xs font-semibold text-[#317157] sm:flex"><Check size={14} aria-hidden="true" />Wish sent</span>}
                  <ChevronDown size={18} className={`shrink-0 text-[#7b847e] transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>

                {isOpen && (
                  <div id={`birthday-wishes-${post.id}`} className="px-4 pb-5 border-t border-[#e4e0d7] pt-5 sm:px-6">
                    {!post.isOwnPost && (
                      <button
                        onClick={() => sendWish(post.id)}
                        disabled={sent || wishing === post.id}
                        data-testid={`wish-btn-${post.id}`}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#8b4a10] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#713b0b] disabled:cursor-default disabled:bg-[#dbe4dc] disabled:text-[#317157] sm:w-auto mb-4"
                      >
                        {sent ? <><Check size={16} aria-hidden="true" />Wish sent</> : wishing === post.id ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" aria-hidden="true" />Sending your wish…</> : <><Heart size={16} aria-hidden="true" />Send a birthday wish</>}
                      </button>
                    )}

                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      {post.wishes.length === 0 ? 'No wishes yet' : `Wished by ${post.wishes.length}`}
                    </p>
                    {post.wishes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Be the first to wish {post.personName}!</p>
                    ) : (
                      <div className="space-y-2">
                        {post.wishes.map((w, i) => (
                          <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-md px-3 py-2">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {w.wisherName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm text-gray-800 truncate">
                                <span className="font-medium">{w.wisherName}</span> · {w.message}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
