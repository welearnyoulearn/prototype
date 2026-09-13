// Chunks a single chapter's text into ~300-500 word pieces for embedding.
// Breaks at paragraph boundaries where possible so a chunk never starts or
// ends mid-thought; only falls back to sentence-level splitting when a
// single paragraph itself exceeds MAX_WORDS. Chunks never span chapters —
// callers always pass one chapter's text at a time.
const MIN_WORDS = 300
const MAX_WORDS = 500
const MIN_KEEP_WORDS = 30 // drop scraps smaller than this (e.g. stray headers)

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

function splitLongParagraph(paragraph: string): string[] {
  const sentences = paragraph.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [paragraph]
  const chunks: string[] = []
  let buf: string[] = []
  let bufWords = 0
  for (const sentence of sentences) {
    const words = wordCount(sentence)
    if (bufWords + words > MAX_WORDS && buf.length > 0) {
      chunks.push(buf.join(' ').trim())
      buf = []
      bufWords = 0
    }
    buf.push(sentence.trim())
    bufWords += words
  }
  if (buf.length > 0) chunks.push(buf.join(' ').trim())
  return chunks
}

export function chunkChapterText(text: string): string[] {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let current: string[] = []
  let currentWords = 0

  const flush = () => {
    if (current.length > 0) {
      chunks.push(current.join('\n\n'))
      current = []
      currentWords = 0
    }
  }

  for (const paragraph of paragraphs) {
    const words = wordCount(paragraph)

    if (words > MAX_WORDS) {
      flush()
      chunks.push(...splitLongParagraph(paragraph))
      continue
    }

    if (currentWords + words > MAX_WORDS && currentWords >= MIN_WORDS) {
      flush()
    }
    current.push(paragraph)
    currentWords += words
  }
  flush()

  return chunks.filter(c => wordCount(c) >= MIN_KEEP_WORDS)
}
