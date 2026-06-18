import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const KEY_HEX = process.env.ENCRYPTION_KEY ?? ''

export function encryptionAvailable(): boolean {
  return KEY_HEX.length === 64
}

export function encrypt(plaintext: string): string {
  if (!encryptionAvailable()) throw new Error('ENCRYPTION_KEY not configured')
  const key = Buffer.from(KEY_HEX, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(ciphertext: string): string {
  if (!encryptionAvailable()) throw new Error('ENCRYPTION_KEY not configured')
  const [ivHex, authTagHex, dataHex] = ciphertext.split(':')
  if (!ivHex || !authTagHex || !dataHex) throw new Error('Invalid ciphertext format')
  const key = Buffer.from(KEY_HEX, 'hex')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const data = Buffer.from(dataHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(data).toString('utf8') + decipher.final('utf8')
}
