import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const load = async () => {
  vi.resetModules()
  return import('./auth')
}

describe('token kept for the tab', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => vi.useRealTimers())

  it('reuses a stored token that has not expired (reload)', async () => {
    sessionStorage.setItem('debt-app.token', JSON.stringify({ value: 'abc', expiresAt: Date.now() + 60_000 }))
    const auth = await load()
    expect(auth.currentToken()).toBe('abc')
  })

  it('ignores and removes an expired token', async () => {
    sessionStorage.setItem('debt-app.token', JSON.stringify({ value: 'old', expiresAt: Date.now() - 1 }))
    const auth = await load()
    expect(auth.currentToken()).toBeNull()
  })

  it('drops the token when it expires', async () => {
    vi.useFakeTimers()
    sessionStorage.setItem('debt-app.token', JSON.stringify({ value: 'abc', expiresAt: Date.now() + 1000 }))
    const auth = await load()
    vi.advanceTimersByTime(2000)
    expect(auth.currentToken()).toBeNull()
    expect(sessionStorage.getItem('debt-app.token')).toBeNull()
  })

  it('ignores a broken value', async () => {
    sessionStorage.setItem('debt-app.token', '{not json')
    const auth = await load()
    expect(auth.currentToken()).toBeNull()
  })

  it('sign out removes the token, also before the Google script is loaded', async () => {
    sessionStorage.setItem('debt-app.token', JSON.stringify({ value: 'abc', expiresAt: Date.now() + 60_000 }))
    const auth = await load()
    auth.signOut()
    expect(auth.currentToken()).toBeNull()
    expect(sessionStorage.getItem('debt-app.token')).toBeNull()
  })

  it('never writes the token to localStorage', async () => {
    sessionStorage.setItem('debt-app.token', JSON.stringify({ value: 'abc', expiresAt: Date.now() + 60_000 }))
    const auth = await load()
    auth.clearToken()
    expect(Object.keys(localStorage).some((k) => k.includes('token'))).toBe(false)
  })
})
