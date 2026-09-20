import { NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'
import { ensureDB } from '@/lib/db'
import { normalizePhone, phoneLast10, maskPhone, INDIAN_MOBILE_ERROR } from '@/lib/phone'
import { generateOtpCode, hashOtp } from '@/lib/otpCrypto'
import {
  OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_MINUTES, otpSecret, clientIp,
  checkSendLimits, eligibleParentsByLast10, createChallenge, recordSendResult,
} from '@/lib/otp'
import { sendWhatsappOtp } from '@/lib/whatsapp'

const bodySchema = z.object({ phone: z.string().trim().min(6).max(25) })

// POST /api/parent/auth/otp/send  { phone }
//
// Step 1 of the parent WhatsApp password reset. The response is the same whether or
// not the number belongs to a parent: a challenge row is always recorded (so limits
// apply equally) and the WhatsApp message is sent AFTER the response, so neither the
// body nor the timing reveals which numbers are registered.
export async function POST(req: NextRequest) {
  try {
    await ensureDB()

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    const phone = parsed.success ? normalizePhone(parsed.data.phone) : null
    if (!phone) {
      return NextResponse.json({ error: INDIAN_MOBILE_ERROR }, { status: 400 })
    }

    const limit = await checkSendLimits(phone, clientIp(req))
    if (!limit.ok) {
      return NextResponse.json(
        { error: limit.message, retryAfter: limit.retryAfter },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
      )
    }

    const parents = await eligibleParentsByLast10(phoneLast10(phone)!)
    const code = generateOtpCode()
    const challengeId = await createChallenge({
      phone,
      codeHash: hashOtp(code, phone, otpSecret()),
      parentIds: parents.map(p => p.id),
      ip: clientIp(req),
    })

    if (parents.length > 0) {
      const primary = parents[0]
      after(async () => {
        try {
          const result = await sendWhatsappOtp({
            to: phone, code, schoolId: primary.school_id, recipientName: primary.name,
          })
          await recordSendResult(challengeId, result.ok ? 'sent' : 'failed', result.ok ? undefined : result.reason)
          if (!result.ok) console.error(`[parent/otp/send] WhatsApp send failed: ${result.reason}`)
        } catch (err) {
          console.error('[parent/otp/send] after()', err)
        }
      })
    }

    return NextResponse.json({
      ok: true,
      maskedPhone: maskPhone(phone),
      resendAfter: OTP_RESEND_COOLDOWN_SECONDS,
      expiresInMinutes: OTP_TTL_MINUTES,
    })
  } catch (error) {
    console.error('[parent/otp/send]', error)
    return NextResponse.json({ error: 'Could not send the code. Please try again.' }, { status: 500 })
  }
}
