import { useCallback, useState } from 'react'

/** Runs an async action from a button and keeps its busy and error state. */
export function useAction<A extends unknown[]>(action: (...args: A) => Promise<unknown>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(
    async (...args: A) => {
      setBusy(true)
      setError(null)
      try {
        await action(...args)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    },
    [action],
  )
  return { run, busy, error }
}
