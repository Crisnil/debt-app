import { useState } from 'react'
import { Link } from 'react-router-dom'
import { addPlannedExpense, savePlannedExpense } from '../../data/actions'
import { billsNotInPlan, linkedPayable, payableLastMonth, plannedLineDone, plannedLiving } from '../../domain/payoff'
import type { PlannedExpense, Workbook } from '../../domain/types'
import { formatPeso, toPesos } from '../../lib/money'
import { useSheetEdit } from '../../state/hooks'
import { Button } from '../../ui/Button'
import { monthLabel } from '../../ui/charts/palette'
import { ErrorNote } from '../../ui/ErrorNote'
import { Field, SuccessNote, TextInput } from '../../ui/form'
import { Modal } from '../../ui/Modal'
import { SectionHead } from '../../ui/SectionHead'
import { editButton, th, type Editing } from '../../ui/table'
import { parsePositiveAmount } from '../add/parseAmount'
import { SheetUpdateCard } from '../settings/SheetUpdateCard'

const panel = 'rounded-xl bg-white p-4 shadow-sm'

/** For a line added from Bills: "🔗 Bills · until Mar 2027", "from Mar 2027", or "monthly". */
function billTag(workbook: Workbook, item: PlannedExpense, month: string): string | null {
  const p = linkedPayable(workbook, item)
  if (!p) return null
  const last = payableLastMonth(p)
  const when = p.startMonth > month ? `from ${monthLabel(p.startMonth)}` : last ? `until ${monthLabel(last)}` : 'monthly'
  return `🔗 Bills · ${when}`
}

/** Add a planned expense (saved on this phone first, then to the sheet), or edit or remove one (online). */
function PlannedForm({ sheetId, item, onSaved }: { sheetId: string; item: PlannedExpense | null; onSaved: (message: string) => void }) {
  const edit = useSheetEdit()
  const [name, setName] = useState(item?.name ?? '')
  const [amount, setAmount] = useState(item ? toPesos(item.amount).toFixed(2) : '')
  const [removing, setRemoving] = useState(false)

  async function save() {
    const cents = parsePositiveAmount(amount)
    if (!name.trim()) return edit.fail('Enter a name, for example "Grocery".')
    if (cents === null) return edit.fail('Enter an amount more than 0.')
    if (!item) {
      addPlannedExpense(sheetId, name.trim(), cents)
      return onSaved(`Added ${name.trim()}.`)
    }
    const message = `Saved ${name.trim()}.`
    const ok = await edit.run(message, (sid, wb, token) => savePlannedExpense(sid, wb, item.row, { name: name.trim(), amount: cents, active: true }, token))
    if (ok) onSaved(message)
  }

  async function remove(line: PlannedExpense) {
    const message = `Removed ${line.name}.`
    const ok = await edit.run(message, (sid, wb, token) => savePlannedExpense(sid, wb, line.row, { name: line.name, amount: line.amount, active: false }, token))
    if (ok) onSaved(message)
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Name" htmlFor="pe-name">
          <TextInput id="pe-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grocery" />
        </Field>
        <Field label="Per month (₱)" htmlFor="pe-amount">
          <TextInput id="pe-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5,000" />
        </Field>
      </div>
      <Button className="w-full" disabled={edit.busy} onClick={() => void save()}>
        {edit.busy ? 'Saving…' : item ? 'Save' : 'Add to the plan'}
      </Button>
      {item &&
        (removing ? (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-900" role="alertdialog" aria-label={`Remove ${item.name}`}>
            <p>Remove {item.name} from the plan?</p>
            <div className="mt-2 flex gap-2">
              <Button variant="danger" disabled={edit.busy} onClick={() => void remove(item)}>
                {edit.busy ? 'Removing…' : 'Yes, remove'}
              </Button>
              <Button variant="secondary" disabled={edit.busy} onClick={() => setRemoving(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button type="button" className="text-sm text-red-800 underline" onClick={() => setRemoving(true)}>
            Remove from the plan
          </button>
        ))}
      <ErrorNote message={edit.error} />
    </div>
  )
}

/**
 * Your planned monthly expenses (a guide), in a table. Their total is the living cost of the Plan line on the payoff chart.
 * Lines added from Bills count only while the bill runs, and are hidden after its last payment.
 */
export function PlannedExpenses({ sheetId, workbook, today }: { sheetId: string; workbook: Workbook; today: string }) {
  const [editing, setEditing] = useState<Editing<PlannedExpense>>(null)
  const [saved, setSaved] = useState<string | null>(null)
  if (workbook.updates.some((u) => u.tab === 'PlannedExpenses' && u.create)) {
    return <SheetUpdateCard workbook={workbook} why="Planned monthly expenses need a new tab in your sheet." />
  }
  const month = today.slice(0, 7)
  const items = workbook.plannedExpenses.filter((e) => e.active && !plannedLineDone(workbook, e, month))
  const total = plannedLiving(workbook, month) ?? 0
  const missing = workbook.updates.some((u) => u.tab === 'PlannedExpenses') ? [] : billsNotInPlan(workbook)
  const open = (item: PlannedExpense | null) => {
    setSaved(null)
    setEditing({ item })
  }
  return (
    <div className={panel}>
      <SectionHead title="Planned monthly expenses" addLabel="+ Add expense" onAdd={() => open(null)} />
      <p className="mt-1 text-xs text-slate-500">Your guide for living costs each month (groceries, utilities, subscriptions, others). The Plan line on the chart uses the total.</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">No planned expenses yet.</p>
      ) : (
        <table className="mt-2 w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <thead>
            <tr className="border-b border-slate-100 text-left">
              <th className={th}>Expense</th>
              <th className={`${th} text-right`}>Per month</th>
              <th className={th}>
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const tag = billTag(workbook, item, month)
              return (
                <tr key={item.itemId}>
                  <td className="py-2">
                    <span className="font-medium text-slate-900">{item.name}</span>
                    {tag && <span className="block text-xs text-slate-500">{tag}</span>}
                    {item.row === 0 && <span className="block text-xs text-slate-500">Saving to the sheet…</span>}
                  </td>
                  <td className="py-2 text-right text-slate-900">{formatPeso(item.amount)}</td>
                  <td className="py-2 text-right">
                    <button type="button" className={editButton} aria-label={`Edit ${item.name}`} disabled={item.row === 0} onClick={() => open(item)}>
                      Edit
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200">
              <td className="pt-2 font-medium text-slate-900">Total this month</td>
              <td className="pt-2 text-right font-semibold text-slate-900">{formatPeso(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
      <SuccessNote message={saved} />
      {missing.length > 0 && (
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          {missing.length === 1 ? '1 monthly bill is' : `${missing.length} monthly bills are`} not in your plan: {missing.map((p) => p.name).join(', ')}. Add{' '}
          {missing.length === 1 ? 'it' : 'them'} with + Plan on{' '}
          <Link to="/bills" className="underline">
            Bills
          </Link>
          .
        </p>
      )}
      {workbook.updates.some((u) => u.tab === 'PlannedExpenses') && <p className="mt-2 text-xs text-slate-500">To add bills from the Bills page, open Settings → Update sheet.</p>}
      <Modal title={editing?.item ? `Edit ${editing.item.name}` : 'Add planned expense'} open={editing !== null} onClose={() => setEditing(null)}>
        <PlannedForm
          key={editing?.item?.itemId ?? 'new'}
          sheetId={sheetId}
          item={editing?.item ?? null}
          onSaved={(message) => {
            setEditing(null)
            setSaved(message)
          }}
        />
      </Modal>
    </div>
  )
}
