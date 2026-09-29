'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown, X } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { StudentEmptyState, StudentPageIntro, studentReveal } from './StudentExperience'
import { Sticker, type Tone } from './stickers'

type Wish = { wisherName: string; message: string; createdAt: string }
type Post = {
  id: number
  personId: number
  personName: string
  isOwnPost: boolean
  wishes: Wish[]
  wishedByMe: boolean
}

const CARD_TONES: Tone[] = ['pink', 'yellow', 'blue', 'mint', 'violet']
const BUBBLE_TONES: Tone[] = ['paper', 'yellow', 'blue', 'mint', 'violet', 'pink']

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
      window.setTimeout(() => setJustWished(current => current === postId ? null : current), 1600)
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send wish')
    } finally {
      setWishing(null)
    }
  }

  if (posts === null) {
    return (
      <div className="mx-auto max-w-3xl space-y-5" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Checking today’s Class Circle…</span>
        <Skeleton className="h-28 rounded-[22px]" />
        <Skeleton className="h-40 rounded-[26px]" />
        <Skeleton className="h-40 rounded-[26px]" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <StudentPageIntro eyebrow="Your class community" title="Class Circle" sticker="party-popper" tone="pink"
        description="Notice your classmates and send a birthday wish when someone is celebrating."
        aside={<span className="sb-chip" data-size="lg" data-tone="yellow"><Sticker name="balloon" size="xs" />Today in your grade</span>} />

      <AnimatePresence initial={false}>{error && (
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="sb-alert" data-tone="coral">
          <span className="flex items-center gap-3"><Sticker name="warning" size="sm" />{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss error" className="sb-icon-btn"><X size={16} aria-hidden="true" /></button>
        </motion.div>
      )}</AnimatePresence>

      {posts.length === 0 ? (
        loadFailed
          ? <StudentEmptyState sticker="thinking-face" title="Class Circle is unavailable" description="We couldn’t check today’s class celebrations." action={{ label: 'Try again', onClick: load }} />
          : <StudentEmptyState sticker="balloon" tone="pink" title="No birthdays in your class today" description="When someone in your grade has a birthday, their card shows up here so you can send a wish." />
      ) : (
        <div className="space-y-10 pt-3">
          {posts.map((post, index) => {
            const isOpen = expanded === post.id
            const sent = post.wishedByMe || justWished === post.id
            const tone = CARD_TONES[index % CARD_TONES.length]
            return (
              <motion.article key={post.id} custom={index} variants={studentReveal} initial={reduceMotion ? false : 'hidden'} animate="visible"
                className="sb-greeting" data-tone={tone}>
                <Sticker name="birthday-cake" size="xl" tilt={-10} className="sb-peek -top-9 right-6" />
                <button
                  onClick={() => setExpanded(isOpen ? null : post.id)}
                  data-testid={`birthday-card-${post.id}`}
                  aria-expanded={isOpen} aria-controls={`birthday-wishes-${post.id}`}
                  className="sb-greeting-head"
                >
                  <span className="sb-avatar h-14 w-14 text-2xl" data-tone="paper" aria-hidden="true">{post.personName.charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="sb-hand block">{post.isOwnPost ? 'it’s your big day!' : 'celebrating today'}</span>
                    <span className="sb-display block truncate text-2xl sm:text-3xl">{post.isOwnPost ? 'Happy birthday to you!' : `${post.personName}’s birthday`}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="sb-chip" data-tone="paper"><Sticker name="wrapped-gift" size="xs" />{post.wishes.length} wish{post.wishes.length !== 1 ? 'es' : ''}</span>
                      {sent && !post.isOwnPost && <span className="sb-chip" data-tone="mint"><Check size={13} aria-hidden="true" />Wish sent</span>}
                    </span>
                  </span>
                  <span className="sb-icon-btn" aria-hidden="true"><ChevronDown size={18} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} /></span>
                </button>

                {isOpen && (
                  <div id={`birthday-wishes-${post.id}`} className="space-y-5 border-t-[2.5px] border-[#1b1611] bg-[#fffdf7] px-5 pb-6 pt-5 rounded-b-[24px]">
                    {!post.isOwnPost && (
                      <div className="relative inline-flex">
                        <button
                          onClick={() => sendWish(post.id)}
                          disabled={sent || wishing === post.id}
                          data-testid={`wish-btn-${post.id}`}
                          className="sb-btn w-full sm:w-auto"
                          data-tone={sent ? 'mint' : 'yellow'}
                        >
                          {sent
                            ? <><Check size={16} aria-hidden="true" />Wish sent!</>
                            : wishing === post.id
                              ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1b1611]/30 border-t-[#1b1611] motion-reduce:animate-none" aria-hidden="true" />Sending your wish…</>
                              : <><Sticker name="balloon" size="xs" />Send {post.personName.split(' ')[0]} a birthday wish</>}
                        </button>
                        <AnimatePresence>{justWished === post.id && !reduceMotion && (
                          <motion.span className="pointer-events-none absolute -right-6 -top-8" initial={{ opacity: 0, scale: .4, rotate: -30 }} animate={{ opacity: 1, scale: 1.1, rotate: 8 }} exit={{ opacity: 0, scale: .6 }} transition={{ duration: .35 }}>
                            <Sticker name="confetti-ball" size="lg" />
                          </motion.span>
                        )}</AnimatePresence>
                      </div>
                    )}

                    <p className="text-xs font-extrabold uppercase tracking-[.1em] text-[#6b604f]">
                      {post.wishes.length === 0 ? 'No wishes yet' : `Wished by ${post.wishes.length}`}
                    </p>
                    {post.wishes.length === 0 ? (
                      <p className="sb-hand">Be the first to wish {post.personName.split(' ')[0]}!</p>
                    ) : (
                      <div className="sb-bubbles">
                        {post.wishes.map((w, i) => (
                          <div key={i} className="sb-bubble" data-tone={BUBBLE_TONES[i % BUBBLE_TONES.length]}>
                            <p className="text-xs font-extrabold">{w.wisherName}</p>
                            <p className="mt-0.5 text-sm font-medium">{w.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </motion.article>
            )
          })}
        </div>
      )}
    </div>
  )
}
