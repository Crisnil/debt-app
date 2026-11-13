import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { UndoRef } from '../../data/actions'
import { useUndo } from '../../state/hooks'
import { ErrorNote } from '../../ui/ErrorNote'

/** What was just saved, and how to take it back. */
export type Saved = { message: string; ref: UndoRef }

/**
 * After a save: what was saved, then Undo, Add another (back to the empty amount), and Done (Home).
 * Use key={saved.ref.id} so a new save starts fresh.
 */
export function SavedNote({ saved, amountId, onClear }: { saved: Saved; amountId: string; onClear: () => void }) {
  const { undo, busy, error } = useUndo()
  const [undone, setUndone] = useState(false)

  async function undoIt() {
    if (await undo(saved.ref)) setUndone(true)
  }

  return (
    <div role="status" className="mt-3 space-y-2 rounded-lg bg-green-50 p-3 text-sm text-green-900">
      <p>{undone ? 'Undone. The app does not count it.' : saved.message}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {!undone && (
          <button type="button" className="font-medium underline" disabled={busy} onClick={() => void undoIt()}>
            {busy ? 'Undoing…' : 'Undo'}
          </button>
        )}
        <button
          type="button"
          className="font-medium underline"
          onClick={() => {
            onClear()
            document.getElementById(amountId)?.focus()
          }}
        >
          Add another
        </button>
        <Link to="/" className="font-medium underline">
          Done
        </Link>
      </div>
      <ErrorNote message={error} />
    </div>
  )
}
