// Telugu and Hindi on-screen keyboards for Student Search. Pure: the layouts and how a key changes the text.
// Keys are grouped the way the alphabets are taught: vowels, then vowel signs, then consonants.

export type KeyboardLanguage = 'te' | 'hi'
export type KeyGroup = { name: string; keys: string[]; combining?: boolean }

const keys = (row: string) => row.split(' ')

export const KEYBOARDS: Record<KeyboardLanguage, { label: string; search: string; space: string; erase: string; groups: KeyGroup[] }> = {
  te: {
    label: 'తెలుగు', search: 'వెతకండి', space: 'ఖాళీ', erase: 'తొలగించు',
    groups: [
      { name: 'అచ్చులు', keys: keys('అ ఆ ఇ ఈ ఉ ఊ ఋ ఎ ఏ ఐ ఒ ఓ ఔ') },
      { name: 'గుణింతాలు', combining: true, keys: keys('ా ి ీ ు ూ ృ ె ే ై ొ ో ౌ ం ః ్') },
      { name: 'హల్లులు', keys: keys('క ఖ గ ఘ ఙ చ ఛ జ ఝ ఞ ట ఠ డ ఢ ణ త థ ద ధ న ప ఫ బ భ మ య ర ల వ శ ష స హ ళ ఱ') },
    ],
  },
  hi: {
    label: 'हिन्दी', search: 'खोजें', space: 'खाली जगह', erase: 'मिटाएँ',
    groups: [
      { name: 'स्वर', keys: keys('अ आ इ ई उ ऊ ऋ ए ऐ ओ औ ऑ') },
      { name: 'मात्राएँ', combining: true, keys: keys('ा ि ी ु ू ृ े ै ो ौ ॉ ं ः ँ ् ़') },
      { name: 'व्यंजन', keys: keys('क ख ग घ ङ च छ ज झ ञ ट ठ ड ढ ण त थ द ध न प फ ब भ म य र ल व श ष स ह') },
    ],
  },
}

export type Typed = { value: string; cursor: number }

/** Puts a key's text where the cursor is, replacing any selected text. Text longer than `max` is not accepted. */
export function typeText(value: string, start: number, end: number, text: string, max: number): Typed {
  const next = value.slice(0, start) + text + value.slice(end)
  return next.length > max ? { value, cursor: end } : { value: next, cursor: start + text.length }
}

/** Removes the selection, or the one character before the cursor, so a wrong vowel sign can be removed alone. */
export function erase(value: string, start: number, end: number): Typed {
  if (start !== end) return { value: value.slice(0, start) + value.slice(end), cursor: start }
  const before = Array.from(value.slice(0, start))
  before.pop()
  const kept = before.join('')
  return { value: kept + value.slice(end), cursor: kept.length }
}
