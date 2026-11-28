// Maths and unit answers for the student search screen. Pure and worked out in the browser: no service is asked.
// It answers only when the whole search is clearly a sum or a conversion; anything else gets no card.

export type Answer = { kind: 'maths' | 'units'; question: string; answer: string }

// Telugu and Devanagari digits become 0-9; commas inside a number (1,000 or 1,00,000) are dropped.
const normalise = (query: string) => query.normalize('NFC')
  .replace(/[౦-౯]/g, d => String(d.charCodeAt(0) - 0x0C66))
  .replace(/[०-९]/g, d => String(d.charCodeAt(0) - 0x0966))
  .replace(/(\d),(?=\d{2,3}(\D|\d{1,3}\b))/g, '$1')
  .toLowerCase().replace(/\s+/g, ' ').trim()
  .replace(/^(what is|what's|calculate|solve|find|convert)\s+/, '')
  .replace(/[\s=?]+$/, '')

/** A number as a student would write it, and whether it had to be rounded. */
function show(value: number): { text: string; rounded: boolean } {
  const short = Number(value.toPrecision(10))
  const text = Math.abs(short) < 1e-6 && short !== 0 ? short.toExponential() : String(short)
  return { text, rounded: Math.abs(short - value) > Math.abs(value) * 1e-12 }
}
const equals = (value: number) => { const s = show(value); return `${s.rounded ? '≈ ' : ''}${s.text}` }
// Beyond this, whole numbers are no longer exact, so no answer is better than a wrong one.
const usable = (value: number) => Number.isFinite(value) && Math.abs(value) < 1e15

class DivideByZero extends Error {}

/** Reads + - * / ^ % and brackets with the usual order. Throws on anything it does not understand. */
function evaluate(tokens: string[]): number {
  let at = 0
  const sum = (): number => {
    let value = product()
    while (tokens[at] === '+' || tokens[at] === '-') value = tokens[at++] === '+' ? value + product() : value - product()
    return value
  }
  const product = (): number => {
    let value = signed()
    while (tokens[at] === '*' || tokens[at] === '/') {
      const operator = tokens[at++]
      const next = signed()
      if (operator === '/' && next === 0) throw new DivideByZero()
      value = operator === '*' ? value * next : value / next
    }
    return value
  }
  // A leading minus applies after the power, so -3^2 is -9.
  const signed = (): number => {
    if (tokens[at] === '-') { at++; return -signed() }
    if (tokens[at] === '+') { at++; return signed() }
    return power()
  }
  const power = (): number => {
    const base = percent()
    if (tokens[at] !== '^') return base
    at++
    return base ** signed()
  }
  const percent = (): number => {
    let value = item()
    while (tokens[at] === '%') { at++; value /= 100 }
    return value
  }
  const item = (): number => {
    const token = tokens[at++]
    if (token === '(') {
      const value = sum()
      if (tokens[at++] !== ')') throw new Error('bracket not closed')
      return value
    }
    if (token === undefined || !/^[\d.]+$/.test(token) || Number.isNaN(Number(token))) throw new Error('not a number')
    return Number(token)
  }
  const value = sum()
  if (at !== tokens.length) throw new Error('left over')
  return value
}

function maths(text: string): Answer | null {
  // Dates, year ranges and names such as 24/7 look like sums but are not.
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(text) || /^\d{4}-\d{2,4}$/.test(text) || text === '24/7' || text === '9/11') return null
  const expression = text
    .replace(/(\d|\)|%)\s*(x|×|multiplied by|times|into)\s*(?=[\d(.-])/g, '$1*')
    .replace(/×/g, '*').replace(/÷|divided by/g, '/').replace(/−/g, '-')
    .replace(/\bplus\b/g, '+').replace(/\bminus\b/g, '-')
    .replace(/%\s*of\b/g, '%*')
  if (!/^[\d\s.+\-*/^%()]+$/.test(expression)) return null
  const tokens = expression.match(/\d*\.?\d+\.?|\S/g) ?? []
  // There must be something to work out: a single number, even a negative or bracketed one, is not a sum.
  const sums = tokens.some((t, i) => i > 0 && /^[+\-*/^]$/.test(t) && /^([\d.]+|\)|%)$/.test(tokens[i - 1]))
  if (!sums || tokens.length > 60) return null
  const question = text.replace(/\*/g, '×')
  try {
    const value = evaluate(tokens)
    return usable(value) ? { kind: 'maths', question, answer: equals(value) } : null
  } catch (err) {
    return err instanceof DivideByZero ? { kind: 'maths', question, answer: 'You can’t divide by zero.' } : null
  }
}

type Quantity = 'length' | 'weight' | 'volume' | 'time' | 'temperature'
type Unit = { quantity: Quantity; symbol: string; size: number; names: string }

// size = how many of the base unit (metre, gram, litre, second) one of these is.
const UNITS: readonly Unit[] = [
  { quantity: 'length', symbol: 'mm', size: 0.001, names: 'mm millimetre millimeter millimetres millimeters' },
  { quantity: 'length', symbol: 'cm', size: 0.01, names: 'cm centimetre centimeter centimetres centimeters' },
  { quantity: 'length', symbol: 'm', size: 1, names: 'm metre meter metres meters' },
  { quantity: 'length', symbol: 'km', size: 1000, names: 'km kms kilometre kilometer kilometres kilometers' },
  { quantity: 'length', symbol: 'inches', size: 0.0254, names: 'inch inches' },
  { quantity: 'length', symbol: 'feet', size: 0.3048, names: 'ft foot feet' },
  { quantity: 'length', symbol: 'miles', size: 1609.344, names: 'mile miles' },
  { quantity: 'weight', symbol: 'mg', size: 0.001, names: 'mg milligram milligrams' },
  { quantity: 'weight', symbol: 'g', size: 1, names: 'g gm gms gram grams' },
  { quantity: 'weight', symbol: 'kg', size: 1000, names: 'kg kgs kilo kilos kilogram kilograms' },
  { quantity: 'weight', symbol: 'quintals', size: 100_000, names: 'quintal quintals' },
  { quantity: 'weight', symbol: 'tonnes', size: 1_000_000, names: 'tonne tonnes ton tons' },
  { quantity: 'volume', symbol: 'ml', size: 0.001, names: 'ml millilitre milliliter millilitres milliliters' },
  { quantity: 'volume', symbol: 'litres', size: 1, names: 'l litre liter litres liters ltr' },
  { quantity: 'time', symbol: 'seconds', size: 1, names: 's sec secs second seconds' },
  { quantity: 'time', symbol: 'minutes', size: 60, names: 'min mins minute minutes' },
  { quantity: 'time', symbol: 'hours', size: 3600, names: 'h hr hrs hour hours' },
  { quantity: 'time', symbol: 'days', size: 86_400, names: 'day days' },
  { quantity: 'temperature', symbol: '°C', size: 1, names: 'c °c celsius centigrade' },
  { quantity: 'temperature', symbol: '°F', size: 1, names: 'f °f fahrenheit' },
  { quantity: 'temperature', symbol: 'K', size: 1, names: 'k kelvin' },
]
const findUnit = (name: string) => UNITS.find(u => u.names.split(' ').includes(name.replace(/^degrees? /, '')))

const toCelsius = (value: number, from: string) => (from === '°F' ? (value - 32) * 5 / 9 : from === 'K' ? value - 273.15 : value)
const fromCelsius = (value: number, to: string) => (to === '°F' ? value * 9 / 5 + 32 : to === 'K' ? value + 273.15 : value)

function units(text: string): Answer | null {
  const match = text.match(/^(-?\d+(?:\.\d+)?)\s*((?:degrees? )?[a-z°]+)\s+(?:to|in|into|=)\s+((?:degrees? )?[a-z°]+)$/)
  if (!match) return null
  const amount = Number(match[1])
  const from = findUnit(match[2])
  const to = findUnit(match[3])
  if (!from || !to || from === to || from.quantity !== to.quantity) return null
  const value = from.quantity === 'temperature'
    ? fromCelsius(toCelsius(amount, from.symbol), to.symbol)
    : amount * from.size / to.size
  if (!usable(value)) return null
  return { kind: 'units', question: `${match[1]} ${from.symbol} in ${to.symbol}`, answer: `${equals(value)} ${to.symbol}` }
}

/** The answer to show for this search, or null when it is not a sum or a unit conversion. */
export function calculate(query: string): Answer | null {
  const text = normalise(query)
  return text ? units(text) ?? maths(text) : null
}
