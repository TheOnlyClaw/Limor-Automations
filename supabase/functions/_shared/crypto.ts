import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

declare const Deno: any

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

let cachedKey: CryptoKey | null = null

function requireEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function encodeBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decodeBase64(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function getKey() {
  if (cachedKey) return cachedKey

  const password = requireEnv('TOKEN_ENCRYPTION_KEY')
  const salt = requireEnv('TOKEN_ENCRYPTION_SALT')

  const passwordKey = await crypto.subtle.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, ['deriveKey'])

  cachedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: textEncoder.encode(salt),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )

  return cachedKey
}

export async function encryptString(plainText: string) {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(plainText))
  const cipherBytes = new Uint8Array(cipherBuffer)
  const joined = new Uint8Array(iv.length + cipherBytes.length)
  joined.set(iv)
  joined.set(cipherBytes, iv.length)
  return encodeBase64(joined)
}

export async function decryptString(encrypted: string) {
  const key = await getKey()
  const joined = decodeBase64(encrypted)
  const iv = joined.slice(0, 12)
  const cipherBytes = joined.slice(12)
  const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes)
  return textDecoder.decode(plainBuffer)
}
