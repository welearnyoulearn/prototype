import type { PoolClient } from 'pg'

// Duplicate-submission guard for money-moving endpoints (payments, waivers).
// A network timeout + client retry, or an impatient double-click before the
// UI's own disable-while-saving state kicks in, previously had no protection
// beyond "does the balance still have room for this amount" — which happily
// admits a genuine duplicate whenever it does.
//
// Usage inside an existing `client.query('BEGIN')` transaction, BEFORE doing
// any of the real work:
//
//   const claim = await claimIdempotencyKey(client, { schoolId, key, endpoint: '/api/fees/payments' })
//   if (!claim.proceed) { await client.query('ROLLBACK'); return NextResponse.json(claim.body, { status: claim.status }) }
//   ... do the real work ...
//   await saveIdempotentResponse(client, { schoolId, key, endpoint: '/api/fees/payments', status, body })
//   await client.query('COMMIT')
//
// Mechanism: claimIdempotencyKey INSERTs a placeholder row keyed on
// (school_id, idempotency_key, endpoint) with UNIQUE constraint on that
// triple. If another transaction already holds an uncommitted INSERT of the
// same key, Postgres blocks this INSERT on that row until the other
// transaction resolves — there is no separate "in-flight" state to manage:
//   - if the other transaction committed, our INSERT sees a real conflict
//     (0 rows via ON CONFLICT DO NOTHING) — fetch and replay its stored
//     response instead of redoing the work.
//   - if the other transaction rolled back (the request failed), there is no
//     conflict anymore and our INSERT succeeds normally — we claim the key
//     and do the real work ourselves.
// Because the placeholder INSERT happens inside the SAME transaction as the
// real work, a failed/rolled-back attempt leaves no trace: a genuine retry
// with the same key can claim it again rather than getting stuck replaying
// a stored failure forever.
//
// A caller that doesn't pass a key (older client, or a caller that hasn't
// been updated yet) gets no deduplication — `proceed: true` unconditionally.
// This is additive protection, not a hard requirement.

export type IdempotencyClaim =
  | { proceed: true }
  | { proceed: false; status: number; body: unknown }

export async function claimIdempotencyKey(
  client: PoolClient,
  params: { schoolId: number | string; key: string | null | undefined; endpoint: string }
): Promise<IdempotencyClaim> {
  if (!params.key || typeof params.key !== 'string') return { proceed: true }

  const { rows } = await client.query(
    `INSERT INTO idempotency_keys (school_id, idempotency_key, endpoint)
     VALUES ($1, $2, $3)
     ON CONFLICT (school_id, idempotency_key, endpoint) DO NOTHING
     RETURNING id`,
    [params.schoolId, params.key, params.endpoint]
  )
  if (rows.length > 0) return { proceed: true }

  // Conflict — a prior request with this exact key already ran to completion.
  const { rows: [existing] } = await client.query(
    `SELECT response_status, response_body FROM idempotency_keys
     WHERE school_id = $1 AND idempotency_key = $2 AND endpoint = $3`,
    [params.schoolId, params.key, params.endpoint]
  )
  // response_status is only ever null in the sliver of time between another
  // request's own claim and its save — which our blocking INSERT above
  // already waited out, so by the time we get here it's always populated.
  // The fallback is only a defensive backstop, not an expected path.
  if (!existing || existing.response_status == null) {
    return { proceed: false, status: 409, body: { error: 'Duplicate request — please retry in a moment.' } }
  }
  return { proceed: false, status: existing.response_status, body: existing.response_body }
}

export async function saveIdempotentResponse(
  client: PoolClient,
  params: { schoolId: number | string; key: string | null | undefined; endpoint: string; status: number; body: unknown }
): Promise<void> {
  if (!params.key || typeof params.key !== 'string') return
  await client.query(
    `UPDATE idempotency_keys SET response_status = $4, response_body = $5
     WHERE school_id = $1 AND idempotency_key = $2 AND endpoint = $3`,
    [params.schoolId, params.key, params.endpoint, params.status, JSON.stringify(params.body)]
  )
}
