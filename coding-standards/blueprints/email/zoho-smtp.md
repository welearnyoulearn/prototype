# Zoho SMTP Email Setup

## Settings

| Setting | Value |
|---------|-------|
| Host | `smtp.zoho.com` |
| Port | `465` (SSL) or `587` (TLS) |
| Auth | Email + app password |

## Node.js Implementation

```bash
pnpm add nodemailer
```

```typescript
// lib/email.ts
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT ?? '465'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
});

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  return transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_FROM_EMAIL}>`,
    to, subject, html,
    text: html.replace(/<[^>]*>/g, ''),
  });
}
```

## Python Implementation

```python
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_email(to: str, subject: str, html: str):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))
    with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_FROM_EMAIL, to, msg.as_string())
```

## Zoho Setup Steps

1. Create email: `noreply@yourdomain.com`
2. Settings > Security > App Passwords > Generate
3. Use app password as `SMTP_PASSWORD`
4. Configure SPF/DKIM DNS records
