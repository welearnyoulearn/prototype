import { TEAL, INK, GOLD, BORDER, CORAL } from '@/app/components/ulearn/theme'

// Draws the printable feedback QR poster straight onto a <canvas> rather
// than screenshotting DOM with html2canvas — html2canvas 1.4 can't parse the
// oklch() colours Tailwind v4 emits, and a hand-drawn canvas gives the same
// pixels for the on-screen preview, the PNG/PDF downloads and native share.

// A4 portrait at 150 dpi — sharp enough to print and stick on a wall.
export const POSTER_WIDTH = 1240
export const POSTER_HEIGHT = 1754

const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
const SERIF = 'Georgia, "Times New Roman", serif'
const MUTED = '#6B7280'

export interface PosterContent {
  schoolName: string
  quote: string
  qrSrc: string
  feedbackUrl: string
  // Event/place QR points only — printed between the header and the quote.
  event?: {
    title: string
    subtitle?: string // e.g. "Sat, 14 Dec 2026  ·  Main Ground"
    details?: string
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load QR image'))
    img.src = src
  })
}

// Greedy word wrap; the last allowed line is ellipsised if text overflows.
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length <= maxLines) return lines

  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1)
  kept[maxLines - 1] = `${last.trimEnd()}…`
  return kept
}

// Largest font size (stepping down) at which the text fits in maxLines.
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: string, family: string, from: number, to: number, maxWidth: number, maxLines: number): number {
  for (let size = from; size > to; size -= 4) {
    ctx.font = `${weight} ${size}px ${family}`
    const words = text.split(/\s+/).filter(Boolean)
    const fitsWords = words.every(w => ctx.measureText(w).width <= maxWidth)
    if (fitsWords && wrapLines(ctx, text, maxWidth, maxLines + 1).length <= maxLines) return size
  }
  return to
}

export async function renderFeedbackPoster(canvas: HTMLCanvasElement, content: PosterContent): Promise<void> {
  const qr = await loadImage(content.qrSrc)
  if (document.fonts?.ready) await document.fonts.ready

  canvas.width = POSTER_WIDTH
  canvas.height = POSTER_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  const W = POSTER_WIDTH
  const H = POSTER_HEIGHT
  const pad = 90
  const textW = W - pad * 2
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // Background + outer frame
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = TEAL
  ctx.lineWidth = 12
  ctx.beginPath()
  ctx.roundRect(30, 30, W - 60, H - 60, 40)
  ctx.stroke()

  // Header band — school name
  const bandTop = 30
  const bandH = 360
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(30, bandTop, W - 60, bandH, [40, 40, 0, 0])
  ctx.fillStyle = TEAL
  ctx.fill()
  ctx.restore()

  const schoolName = content.schoolName.trim() || 'Our School'
  const nameSize = fitFont(ctx, schoolName, '800', FONT, 88, 48, textW, 2)
  ctx.font = `800 ${nameSize}px ${FONT}`
  const nameLines = wrapLines(ctx, schoolName, textW, 2)
  const nameLineH = nameSize * 1.15
  ctx.fillStyle = '#FFFFFF'
  // Centre the name's visible block (first cap-top to last baseline) in the
  // band above the "WE VALUE YOUR FEEDBACK" tag, which sits at the bottom.
  const capH = nameSize * 0.72
  const areaTop = bandTop + 30
  const areaBottom = bandTop + bandH - 95
  const blockH = (nameLines.length - 1) * nameLineH + capH
  let y = areaTop + (areaBottom - areaTop - blockH) / 2 + capH
  for (const line of nameLines) {
    ctx.fillText(line, W / 2, y)
    y += nameLineH
  }
  ctx.font = `600 34px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.fillText('WE VALUE YOUR FEEDBACK', W / 2, bandTop + bandH - 45)

  const event = content.event
  y = bandTop + bandH
  const quote = content.quote.trim()

  if (event) {
    // Event block: title, date/venue line, optional details
    y += 105
    const titleSize = fitFont(ctx, event.title, '800', FONT, 80, 44, textW, 2)
    ctx.font = `800 ${titleSize}px ${FONT}`
    ctx.fillStyle = CORAL
    for (const line of wrapLines(ctx, event.title, textW, 2)) {
      ctx.fillText(line, W / 2, y)
      y += titleSize * 1.15
    }
    if (event.subtitle) {
      y += 5
      ctx.font = `600 38px ${FONT}`
      ctx.fillStyle = INK
      ctx.fillText(wrapLines(ctx, event.subtitle, textW, 1)[0] ?? '', W / 2, y)
      y += 52
    }
    if (event.details) {
      ctx.font = `500 32px ${FONT}`
      ctx.fillStyle = MUTED
      for (const line of wrapLines(ctx, event.details, textW, 2)) {
        ctx.fillText(line, W / 2, y)
        y += 42
      }
    }
    // Quote card: soft gold-tinted panel with a gold accent bar and a large
    // opening mark, so the quote reads as its own element rather than a
    // footnote under the details.
    if (quote) {
      y += 30
      const cardX = pad
      const cardW = W - pad * 2
      const innerW = cardW - 150
      const quoteSize = fitFont(ctx, quote, 'italic 600', SERIF, 46, 32, innerW, 3)
      ctx.font = `italic 600 ${quoteSize}px ${SERIF}`
      const lines = wrapLines(ctx, quote, innerW, 3)
      const lineH = quoteSize * 1.3
      const cardH = 56 + lines.length * lineH

      ctx.fillStyle = '#FBF6EA'
      ctx.beginPath()
      ctx.roundRect(cardX, y, cardW, cardH, 24)
      ctx.fill()
      ctx.fillStyle = GOLD
      ctx.beginPath()
      ctx.roundRect(cardX, y, 12, cardH, [24, 0, 0, 24])
      ctx.fill()

      ctx.font = `700 120px ${SERIF}`
      ctx.fillStyle = GOLD
      ctx.globalAlpha = 0.35
      ctx.textAlign = 'left'
      ctx.fillText('“', cardX + 30, y + 100)
      ctx.globalAlpha = 1
      ctx.textAlign = 'center'

      ctx.font = `italic 600 ${quoteSize}px ${SERIF}`
      ctx.fillStyle = INK
      let ly = y + 28 + quoteSize
      for (const line of lines) {
        ctx.fillText(line, W / 2 + 20, ly)
        ly += lineH
      }
      y += cardH
    }
  } else {
    // Quote with a large decorative mark
    y += 120
    ctx.font = `700 150px ${SERIF}`
    ctx.fillStyle = GOLD
    ctx.fillText('“', W / 2, y + 30)
    y += 70
    if (quote) {
      const quoteSize = fitFont(ctx, quote, 'italic 500', SERIF, 52, 34, textW - 40, 3)
      ctx.font = `italic 500 ${quoteSize}px ${SERIF}`
      ctx.fillStyle = INK
      for (const line of wrapLines(ctx, quote, textW - 40, 3)) {
        ctx.fillText(line, W / 2, y)
        y += quoteSize * 1.35
      }
    }
  }

  // QR code in a soft card — shrinks to fit whatever space the text above
  // left (bottom edge fixed so the call to action + link always fit), but
  // never below ~7cm printed, which stays comfortably scannable.
  const qrBottomLimit = 1465
  const qrTop = event ? y + 35 : Math.max(y + 30, 820)
  const qrCard = Math.max(420, Math.min(620, qrBottomLimit - qrTop))
  const qrSize = qrCard - 60
  const qrX = (W - qrCard) / 2
  ctx.fillStyle = '#F8F9F6'
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(qrX, qrTop, qrCard, qrCard, 32)
  ctx.fill()
  ctx.stroke()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(qr, qrX + 30, qrTop + 30, qrSize, qrSize)
  ctx.imageSmoothingEnabled = true

  // Call to action
  y = qrTop + qrCard + 95
  ctx.font = `800 60px ${FONT}`
  ctx.fillStyle = INK
  ctx.fillText('Scan to share your feedback', W / 2, y)
  y += 60
  ctx.font = `500 36px ${FONT}`
  ctx.fillStyle = MUTED
  ctx.fillText('No login needed  ·  Takes less than a minute', W / 2, y)

  // Footer — the link, for anyone who can't scan
  ctx.font = `500 28px ${FONT}`
  ctx.fillStyle = MUTED
  const urlLines = wrapLines(ctx, content.feedbackUrl, textW, 1)
  ctx.fillText(urlLines[0] ?? '', W / 2, H - 80)
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Failed to export poster'))), 'image/png')
  })
}
