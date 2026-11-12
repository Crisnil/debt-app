import { config } from '../config'
import { loadScript } from './loadScript'

export const SCOPE = 'https://www.googleapis.com/auth/drive.file'

type Token = { value: string; expiresAt: number }

export const TOKEN_KEY = 'debt-app.token'

// The access token is kept in sessionStorage so a reload keeps the sign-in for the rest of its hour.
// sessionStorage belongs to this tab only and is cleared when the tab or app closes. Never localStorage.
function readStoredToken(): Token | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY)
    const t = raw ? (JSON.parse(raw) as Token) : null
    return t && typeof t.value === 'string' && typeof t.expiresAt === 'number' && t.expiresAt > Date.now() ? t : null
  } catch {
    return null
  }
}

function storeToken(t: Token | null) {
  token = t
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(t))
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage blocked: the token stays in memory only.
  }
}

let token: Token | null = readStoredToken()
let client: google.accounts.oauth2.TokenClient | null = null
let waiting: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null

export class AuthError extends Error {}

async function getClient() {
  if (client) return client
  await loadScript('https://accounts.google.com/gsi/client')
  client = google.accounts.oauth2.initTokenClient({
    client_id: config.googleClientId,
    scope: SCOPE,
    callback: (response) => {
      const pending = waiting
      waiting = null
      if (response.error || !response.access_token) {
        pending?.reject(new AuthError(response.error_description ?? response.error ?? 'Sign-in failed.'))
        return
      }
      // Renew one minute early.
      const fresh = { value: response.access_token, expiresAt: Date.now() + (response.expires_in - 60) * 1000 }
      storeToken(fresh)
      pending?.resolve(fresh.value)
    },
    error_callback: (error) => {
      const pending = waiting
      waiting = null
      pending?.reject(new AuthError(error.type === 'popup_closed' ? 'Sign-in was closed.' : (error.message ?? 'Sign-in failed.')))
    },
  })
  return client
}

export function currentToken(): string | null {
  if (token && token.expiresAt > Date.now()) return token.value
  if (token) storeToken(null)
  return null
}

/** Opens Google sign-in. Call from a button click so the popup is not blocked. */
export async function signIn(prompt: '' | 'consent' | 'select_account' = ''): Promise<string> {
  const valid = currentToken()
  if (valid) return valid
  const c = await getClient()
  return new Promise<string>((resolve, reject) => {
    waiting?.reject(new AuthError('Sign-in replaced by a new request.'))
    waiting = { resolve, reject }
    c.requestAccessToken({ prompt })
  })
}

export function clearToken() {
  storeToken(null)
}

export function signOut() {
  // After a reload the token can come from storage before the Google script is loaded.
  if (token && typeof google !== 'undefined') google.accounts.oauth2.revoke(token.value)
  storeToken(null)
}
