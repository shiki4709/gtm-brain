// API Key generation and hashing — zero external dependencies
// Uses Web Crypto API (native in Node.js 18+ and Next.js edge/server)

const KEY_PREFIX = 'nvr_live_'
const RANDOM_BYTES = 24

interface GeneratedKey {
  readonly fullKey: string   // shown to user once: nvr_live_xxxxxxxxxxxxxxxxxxxx
  readonly prefix: string    // stored for lookup: nvr_live_xxxx
  readonly hash: string      // SHA-256 hex, stored in DB
}

export async function generateApiKey(): Promise<GeneratedKey> {
  const bytes = new Uint8Array(RANDOM_BYTES)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  const fullKey = `${KEY_PREFIX}${hex}`
  const prefix = fullKey.substring(0, 12)
  const hash = await hashApiKey(fullKey)
  return { fullKey, prefix, hash }
}

export async function hashApiKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key)
  const buffer = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('')
}
