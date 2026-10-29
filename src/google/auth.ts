import { config } from '../config'
import { loadScript } from './loadScript'

export const SCOPE = 'https://www.googleapis.com/auth/drive.file'

type Token = { value: string; expiresAt: number }

// The access token lives in memory only. It is never written to storage.
let token: Token | null = null
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
      token = { value: response.access_token, expiresAt: Date.now() + (response.expires_in - 60) * 1000 }
      pending?.resolve(token.value)
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
  return token && token.expiresAt > Date.now() ? token.value : null
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
  token = null
}

export function signOut() {
  if (token) google.accounts.oauth2.revoke(token.value)
  token = null
}
