# WhatsApp OTP setup (parent password reset)

The code for the parent "Forgot password" flow is finished. It only needs a WhatsApp
Business account and five secrets. Until those are set:

- **Development:** the 6-digit code is printed in the dev-server console instead of being sent. The whole flow works.
- **Production:** no code is ever sent or printed. The parent sees the normal "we sent a code" screen but receives nothing, so do **not** deploy this to production until the steps below are done.

One WhatsApp number, owned by WLYL, sends every code for every school. Cost is paid to Meta per delivered message (see *Cost* below).

## 1. Meta accounts (start with step 2, it takes days)

1. Create or open your **Meta Business portfolio** at business.facebook.com.
2. **Business verification** (Business settings → Security Center → Start verification). Use your registered company documents. Until verified, you can message only about 250 different people per 24 hours, which is fine for testing.
3. Go to developers.facebook.com → **Create app** → type **Business** → add the **WhatsApp** product, and link it to your business portfolio.

## 2. Phone number

1. In the app: WhatsApp → API Setup → **Add phone number**.
2. The number must **not** be registered on the regular WhatsApp or WhatsApp Business app (delete that account first if it is). It must be able to receive an SMS or voice call for verification.
3. Set the **display name** to `WeLearnYouLearn`. Meta reviews it, which usually takes a day.
4. Add a **payment method** (WhatsApp Manager → Payment settings). Messages are billed to it.

## 3. Message template

WhatsApp Manager → Message templates → **Create template**:

| Field | Value |
|---|---|
| Category | **Authentication** |
| Name | `wlyl_parent_otp` (or set `WHATSAPP_OTP_TEMPLATE`) |
| Language | English (`en`, or set `WHATSAPP_OTP_LANG`) |
| Code delivery | **Copy code** button |
| Add security recommendation | optional |
| Code expiry | 5 minutes (matches the app) |

Meta fixes the text of authentication templates, so the message will read
**"123456 is your verification code."** followed by the copy-code button. Approval is
normally within minutes.

## 4. Access token

1. Business settings → Users → **System users** → Add (role: Admin).
2. Assign your app and the WhatsApp account to it (full control).
3. **Generate token** → choose your app → permissions `whatsapp_business_messaging` and `whatsapp_business_management` → **Never expire**.
4. Copy the token. It is shown once.

## 5. Environment variables

Set in `.env` (local) and in Vercel → Project → Settings → Environment Variables (Production and Preview). Never commit them.

| Variable | Where to find it | Required |
|---|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp → API Setup, "Phone number ID" | yes |
| `WHATSAPP_ACCESS_TOKEN` | the system-user token from step 4 | yes |
| `WHATSAPP_VERIFY_TOKEN` | any long random string you invent | for delivery tracking |
| `WHATSAPP_APP_SECRET` | App settings → Basic → App secret | for delivery tracking |
| `WHATSAPP_OTP_TEMPLATE` | template name, default `wlyl_parent_otp` | no |
| `WHATSAPP_OTP_LANG` | template language, default `en` | no |
| `OTP_SECRET` | random string; if unset, `JWT_SECRET` is used | recommended |
| `OTP_DAILY_CAP` | max real sends per rolling 24 h, default `2000` | no |

`OTP_SECRET` can be generated with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Changing it invalidates any code that is currently waiting (they live 5 minutes).

## 6. Delivery-status webhook (optional but recommended)

App dashboard → WhatsApp → **Configuration** → Webhook:

- Callback URL: `https://<your-domain>/api/whatsapp/webhook`
- Verify token: the value of `WHATSAPP_VERIFY_TOKEN`
- Subscribe to the **messages** field.

Meta then reports sent / delivered / read / failed, which the app records in the `whatsapp_messages` table (the code itself is never stored there).

## 7. Test

1. With the credentials above, Meta's free test number can message up to 5 verified recipient numbers. Add your own number under API Setup → "To".
2. Open `/parent/login` → **Forgot password?** → enter a registered parent's number → the code arrives on WhatsApp.
3. Finish the flow and sign in with the new password.

If nothing arrives: check `whatsapp_messages.failure_reason` and `otp_challenges.send_error` for the failed row. Common causes are an unapproved template, a wrong phone-number ID, an expired token, or the recipient number not being on WhatsApp.

## Cost

Authentication messages in India were listed at about ₹0.115 per delivered message in July 2026, plus 18% GST, so roughly **₹0.14 per code**. Check the current rate card in WhatsApp Manager → Pricing. The limits (3 codes per number per hour, 10 per IP per hour, `OTP_DAILY_CAP` per day) keep the bill bounded even under abuse.

## What the app enforces

- Only proper 10-digit Indian mobile numbers (starting 6–9) are accepted anywhere a parent phone is entered: single add, bulk import, edit, sign-in and reset.
- 6-digit code, stored only as an HMAC hash, valid 5 minutes, usable once, locked after 5 wrong tries.
- 30-second resend cooldown, then the hourly and daily limits above.
- The reply is identical whether or not the number belongs to a parent, so the form can't be used to discover who is registered.
- After a correct code the parent gets a 10-minute, single-use ticket to set a new password.

## Not covered yet

- SMS fallback (needs DLT registration in India).
- Per-school WhatsApp accounts (the `school_whatsapp_config` table is for later features such as fee reminders).
- Signing out a parent who is already logged in on another device when their password is reset (parent sessions are 7-day cookies; see KNOWN_ISSUES).
