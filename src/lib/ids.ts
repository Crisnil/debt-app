const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford base32

/**
 * Sortable unique ID (ULID format): 10 characters of time + 16 random characters.
 * The app makes the ID before saving, so a retry after a network error can see that
 * the row is already in the sheet and does not add it twice.
 */
export function newId(now = Date.now(), random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  let time = ''
  let t = now
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time
    t = Math.floor(t / 32)
  }
  const bytes = random(16)
  let rand = ''
  for (let i = 0; i < 16; i++) rand += ALPHABET[bytes[i] % 32]
  return time + rand
}
