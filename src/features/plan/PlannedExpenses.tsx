import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { addPlannedExpense, savePlannedExpense } from '../../data/actions'
import { billsNotInPlan, linkedPayable, payableLastMonth, plannedLineDone, plannedLiving } from '../../domain/payoff'
import type { PlannedExpense, Workbook } from '../../domain/types'
import { formatPeso, toPesos } from '../../lib/money'
import { useSheetEdit } from '../../state/hooks'
import { Button } from '../../ui/Button'
import { monthLabel } from '../../ui/charts/palette'
import { ErrorNote } from '../../ui/ErrorNote'
import { TextInput } from '../../ui/form'
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

function Row({ item, tag }: { item: PlannedExpense; tag: string | null }) {
  const edit = useSheetEdit()
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  const [name, setName] = useState(item.name)
  const [amount, setAmount] = useState(toPesos(item.amount).toFixed(2))
  const synced = item.row > 0

  function save(e: FormEvent) {
    e.preventDefault()
    const cents = parsePositiveAmount(amount)
    if (!name.trim()) return edit.fail('Enter a name.')
    if (cents === null) return edit.fail('Enter an amount more than 0.')
    void edit.run(`Saved ${name.trim()}.`, async (sheetId, wb, token) => {
      await savePlannedExpense(sheetId, wb, item.row, { name: name.trim(), amount: cents, active: true }, token)
      setMode('view')
    })
  }

  return (
    <li className="border-t border-slate-100 py-2 first:border-0">
      {mode === 'edit' ? (
        <form onSubmit={save} className="flex flex-wrap items-center gap-2" noValidate>
          <TextInput aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextInput aria-label="Amount per month (₱)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" className="px-3 py-1.5" disabled={edit.busy}>
              {edit.busy ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="secondary" className="px-3 py-1.5" onClick={() => setMode('view')}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-slate-800">
            {item.name}
            {tag && <span className="block text-xs text-slate-500">{tag}</span>}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <b className="text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatPeso(item.amount)}
            </b>
            <Button variant="secondary" className="px-3 py-1.5" disabled={!synced} onClick={() => setMode('edit')}>
              Edit
            </Button>
            <Button variant="danger" className="px-3 py-1.5" disabled={!synced} onClick={() => setMode('delete')}>
              Delete
            </Button>
          </span>
        </div>
      )}
      {mode === 'delete' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-2 text-sm text-red-900" role="alertdialog" aria-label={`Delete ${item.name}`}>
          Remove {item.name} from the plan?
          <Button
            variant="danger"
            className="px-3 py-1.5"
            disabled={edit.busy}
            onClick={() => void edit.run(`Removed ${item.name}.`, (sheetId, wb, token) => savePlannedExpense(sheetId, wb, item.row, { name: item.name, amount: item.amount, active: false }, token))}
          >
            {edit.busy ? 'Removing…' : 'Yes, remove'}
          </Button>
          <Button variant="secondary" className="px-3 py-1.5" onClick={() => setMode('view')}>
            Cancel
          </Button>
        </div>
      )}
      <ErrorNote message={edit.error} />
    </li>
  )
}

function AddRow({ sheetId }: { sheetId: string }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  function add(e: FormEvent) {
    e.preventDefault()
    const cents = parsePositiveAmount(amount)
    if (!name.trim()) return setError('Enter a name, for example "Grocery".')
    if (cents === null) return setError('Enter an amount more than 0.')
    setError(null)
    addPlannedExpense(sheetId, name.trim(), cents)
    setName('')
    setAmount('')
  }

  return (
    <form onSubmit={add} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3" noValidate>
      <div className="min-w-0 flex-1">
        <TextInput aria-label="New planned expense" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grocery" />
      </div>
      <div className="w-32">
        <TextInput aria-label="Amount per month (₱)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5,000" />
      </div>
      <Button type="submit">+ Add</Button>
      <div className="w-full">
        <ErrorNote message={error} />
      </div>
    </form>
  )
}

/**
 * Your planned monthly expenses (a guide). Their total is the living cost of the Plan line on the payoff chart.
 * Lines added from Bills count only while the bill runs, and are hidden after its last payment.
 */
export function PlannedExpenses({ sheetId, workbook, today }: { sheetId: string; workbook: Workbook; today: string }) {
  if (workbook.updates.some((u) => u.tab === 'PlannedExpenses' && u.create)) {
    return <SheetUpdateCard workbook={workbook} why="Planned monthly expenses need a new tab in your sheet." />
  }
  const month = today.slice(0, 7)
  const items = workbook.plannedExpenses.filter((e) => e.active && !plannedLineDone(workbook, e, month))
  const total = plannedLiving(workbook, month) ?? 0
  const missing = workbook.updates.some((u) => u.tab === 'PlannedExpenses') ? [] : billsNotInPlan(workbook)
  return (
    <div className={panel}>
      <h2 className="font-medium text-slate-900">Planned monthly expenses</h2>
      <p className="mb-2 text-xs text-slate-500">Your guide for living costs each month (groceries, utilities, subscriptions, others). The Plan line on the chart uses the total.</p>
      {items.length === 0 ? (
        <p className="text-sm text-slate-600">No planned expenses yet.</p>
      ) : (
        <ul className="text-sm">
          {items.map((item) => (
            <Row key={item.itemId} item={item} tag={billTag(workbook, item, month)} />
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <p className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm">
          <span className="font-medium text-slate-900">Total this month</span>
          <b className="text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatPeso(total)}
          </b>
        </p>
      )}
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
      <AddRow sheetId={sheetId} />
      {workbook.updates.some((u) => u.tab === 'PlannedExpenses') && <p className="mt-2 text-xs text-slate-500">To add bills from the Bills page, open Settings → Update sheet.</p>}
    </div>
  )
}
