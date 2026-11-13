import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { undoEntry, type UndoRef } from '../data/actions'
import { discard, flushOutbox, mergeOutbox, readOutbox, subscribeOutbox, type OutboxItem } from '../data/outbox'
import { loadWorkbook } from '../data/workbook'
import type { Workbook } from '../domain/types'
import { AuthError, currentToken } from '../google/auth'
import { SessionContext, type Session } from './sessionContext'

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside SessionProvider')
  return session
}

/** The workbook as stored in the sheet. */
export function useWorkbook() {
  const { signedIn, sheet } = useSession()
  return useQuery({
    queryKey: ['workbook', sheet?.id],
    enabled: signedIn && sheet !== null,
    queryFn: async () => {
      const token = currentToken()
      if (!token) throw new AuthError('Sign in to load your sheet.')
      return loadWorkbook(sheet!.id, token)
    },
    retry: (count, error) => !(error instanceof AuthError) && count < 2,
    staleTime: 60_000,
  })
}

const EMPTY: OutboxItem[] = []

export function useOutbox(): OutboxItem[] {
  const { sheet } = useSession()
  return useSyncExternalStore(subscribeOutbox, () => (sheet ? readOutbox(sheet.id) : EMPTY))
}

/** The workbook plus entries that are saved on this phone but not in the sheet yet. */
export function useLiveWorkbook(): { workbook: Workbook | undefined; query: ReturnType<typeof useWorkbook>; pending: number } {
  const query = useWorkbook()
  const outbox = useOutbox()
  const workbook = useMemo(() => (query.data ? mergeOutbox(query.data, outbox) : undefined), [query.data, outbox])
  return { workbook, query, pending: outbox.length }
}

/** Runs an edit that writes to the sheet directly (online only), then reloads the workbook. */
export function useSheetEdit() {
  const { sheet } = useSession()
  const { data } = useWorkbook()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const run = useCallback(
    /** Resolves true when the edit is saved. */
    async (message: string, edit: (sheetId: string, workbook: Workbook, token: string) => Promise<void>): Promise<boolean> => {
      const token = currentToken()
      setDone(null)
      if (!sheet || !data || !token) {
        setError('Sign in and select your sheet first.')
        return false
      }
      if (!navigator.onLine) {
        setError('You are offline. Settings need an internet connection.')
        return false
      }
      setBusy(true)
      setError(null)
      try {
        await edit(sheet.id, data, token)
        await queryClient.invalidateQueries({ queryKey: ['workbook', sheet.id] })
        setDone(message)
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        return false
      } finally {
        setBusy(false)
      }
    },
    [sheet, data, queryClient],
  )
  const fail = useCallback((message: string) => {
    setDone(null)
    setError(message)
  }, [])
  return { run, fail, busy, error, done }
}

/** Undo of an entry just added: takes it back while it waits on this phone, else voids it in the sheet. */
export function useUndo() {
  const { sheet } = useSession()
  const { run, busy, error } = useSheetEdit()
  const undo = useCallback(
    async (ref: UndoRef): Promise<boolean> => {
      if (sheet && discard(sheet.id, ref.id)) return true
      return run('Undone.', (sheetId, wb, token) => undoEntry(sheetId, wb, ref, token))
    },
    [sheet, run],
  )
  return { undo, busy, error }
}

export type SyncState ={ pending: number; syncing: boolean; error: string | null; syncNow: () => void }

/** Sends waiting entries to the sheet when signed in and online. Mount once (in the app shell). */
export function useSync(): SyncState {
  const { sheet, signedIn } = useSession()
  const queryClient = useQueryClient()
  const { data } = useWorkbook()
  const outbox = useOutbox()
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const syncNow = useCallback(async () => {
    const token = currentToken()
    if (!sheet || !data || !token || readOutbox(sheet.id).length === 0 || !navigator.onLine) return
    setSyncing(true)
    setError(null)
    try {
      await flushOutbox(sheet.id, data.headers, token)
      await queryClient.invalidateQueries({ queryKey: ['workbook', sheet.id] })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }, [sheet, data, queryClient])

  useEffect(() => {
    if (!signedIn || outbox.length === 0) return
    // Short delay: several quick entries are sent together.
    const timer = setTimeout(() => void syncNow(), 500)
    return () => clearTimeout(timer)
  }, [signedIn, outbox.length, syncNow])

  useEffect(() => {
    const onOnline = () => void syncNow()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [syncNow])

  return { pending: outbox.length, syncing, error, syncNow: () => void syncNow() }
}

export type RefreshState = { refresh: () => void; busy: boolean; error: string | null; updatedAt: Date | null; pending: number }

/** Refresh on request: sends waiting entries, then reloads the sheet (e.g. after a change made in the sheet). */
export function useRefresh(): RefreshState {
  const { sheet } = useSession()
  const queryClient = useQueryClient()
  const { data } = useWorkbook()
  const outbox = useOutbox()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    const token = currentToken()
    if (!sheet || !token) return setError('Sign in to refresh.')
    if (!navigator.onLine) return setError('You are offline. Balances show what is saved on this phone.')
    setBusy(true)
    setError(null)
    try {
      if (data && readOutbox(sheet.id).length > 0) await flushOutbox(sheet.id, data.headers, token)
      const key = ['workbook', sheet.id]
      await queryClient.invalidateQueries({ queryKey: key })
      const failed = queryClient.getQueryState(key)?.error
      if (failed) throw failed
      setUpdatedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [sheet, data, queryClient])

  return { refresh: () => void refresh(), busy, error, updatedAt, pending: outbox.length }
}
