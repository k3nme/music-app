/** Short, collision-resistant ids. Good enough for project-local objects. */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function uid(prefix = ''): string {
  let out = ''
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return prefix ? `${prefix}_${out}` : out
}
