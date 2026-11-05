import { useState } from 'react'
import { applySheetUpdates } from '../../data/actions'
import type { Workbook } from '../../domain/types'
import { useSheetEdit } from '../../state/hooks'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'
import { SuccessNote } from '../../ui/form'

/** Shows what the sheet is missing and adds it after the user confirms. Only adds tabs and header cells. */
export function SheetUpdateCard({ workbook, why }: { workbook: Workbook; why?: string }) {
  const edit = useSheetEdit()
  const [confirming, setConfirming] = useState(false)
  const updates = workbook.updates
  if (updates.length === 0) return edit.done ? <SuccessNote message={edit.done} /> : null

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <h2 className="font-medium">Your sheet needs an update</h2>
      {why && <p className="mt-1">{why}</p>}
      <ul className="mt-2 list-disc space-y-0.5 pl-5">
        {updates.map((u) => (
          <li key={u.tab}>
            {u.create ? (
              <>
                Add tab <b>{u.tab}</b> with its header row
              </>
            ) : (
              <>
                Add column{u.columns.length > 1 ? 's' : ''} <b>{u.columns.join(', ')}</b> to tab <b>{u.tab}</b>
              </>
            )}
          </li>
        ))}
      </ul>
      {confirming ? (
        <div className="mt-3 space-y-2">
          <p>The app adds only these tabs and header cells. Your rows are not changed.</p>
          <div className="flex gap-2">
            <Button disabled={edit.busy} onClick={() => void edit.run('Sheet updated.', (sheetId, wb, token) => applySheetUpdates(sheetId, wb, updates, token))}>
              {edit.busy ? 'Updating…' : 'Yes, update my sheet'}
            </Button>
            <Button variant="secondary" disabled={edit.busy} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-3" onClick={() => setConfirming(true)}>
          Update sheet
        </Button>
      )}
      <ErrorNote message={edit.error} />
    </div>
  )
}
