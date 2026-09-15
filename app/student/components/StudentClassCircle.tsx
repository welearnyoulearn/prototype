'use client'

import { useEffect, useState } from 'react'

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

  function load() {
    fetch('/api/student/class-circle')
      .then(r => r.ok ? r.json() : { posts: [] })
      .then(d => setPosts(d.posts ?? []))
      .catch(() => setPosts([]))
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
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send wish')
    } finally {
      setWishing(null)
    }
  }

  if (posts === null) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-gray-100 rounded-xl w-48" />
        <div className="h-28 bg-gray-100 rounded-2xl" />
        <div className="h-28 bg-gray-100 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">🎈 Class Circle</h1>
      <p className="text-sm text-gray-500 mb-5">Today's birthdays in your grade</p>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      {posts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <div className="text-4xl mb-3">🍫</div>
          <p className="text-gray-500 font-medium">Oops, no chocolate today!</p>
          <p className="text-gray-400 text-sm mt-1">No birthdays in your class today — check back tomorrow 🎈</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(post => {
            const isOpen = expanded === post.id
            return (
              <div key={post.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : post.id)}
                  data-testid={`birthday-card-${post.id}`}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-2xl flex-shrink-0">🎉</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      It&apos;s {post.personName}&apos;s birthday today!
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {post.wishes.length} wish{post.wishes.length !== 1 ? 'es' : ''}
                    </p>
                  </div>
                  <span className={`text-gray-300 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 border-t border-gray-100 pt-4">
                    {!post.isOwnPost && (
                      <button
                        onClick={() => sendWish(post.id)}
                        disabled={post.wishedByMe || wishing === post.id}
                        data-testid={`wish-btn-${post.id}`}
                        className="w-full sm:w-auto bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-all disabled:opacity-50 mb-4"
                      >
                        {post.wishedByMe ? '✓ You wished them!' : wishing === post.id ? 'Sending…' : 'Send Wish 🎉'}
                      </button>
                    )}

                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      {post.wishes.length === 0 ? 'No wishes yet' : `Wished by ${post.wishes.length}`}
                    </p>
                    {post.wishes.length === 0 ? (
                      <p className="text-sm text-gray-400">Be the first to wish {post.personName}!</p>
                    ) : (
                      <div className="space-y-2">
                        {post.wishes.map((w, i) => (
                          <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
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
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
