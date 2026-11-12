import { useState } from 'react'
import { Link } from 'react-router-dom'
import { addPlannedExpense, savePlannedExpense, stopPayable } from '../../data/actions'
import { todayIso } from '../../domain/dues'
import { billsThisMonth, type PayableMonth } from '../../domain/payables'
import type { Payable, Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { useSheetEdit } from '../../state/hooks'
import { Button } from '../../ui/Button'
import { monthLabel } from '../../ui/charts/palette'
import { ErrorNote } from '../../ui/ErrorNote'
import { SuccessNote } from '../../ui/form'
import { Modal } from '../../ui/Modal'
import { SectionHead } from '../../ui/SectionHead'
import { editButton, th } from '../../ui/table'
import { SheetUpdateCard } from '../settings/SheetUpdateCard'
import { WithWorkbook } from '../WithWorkbook'
import { AddPayableForm, EditPayableForm, PayForm } from './PayableForms'

const PAYABLE_TABS = ['Payables', 'PayableAmounts', 'Transactions']
// The + Plan button needs the PlannedExpenses tab with its payable_id column.
const canPlan = (wb: Workbook) => !wb.updates.some((u) => u.tab === 'PlannedExpenses')

const shortDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })

/** Which pop-up is open for which bill month. */
type Open = { kind: 'pay' | 'edit'; item: PayableMonth } | { kind: 'add' } | null

function status(item: PayableMonth, today: string): { text: string; tone: string } {
  if (item.left === 0) return { text: '✓ Paid', tone: 'text-green-900' }
  if (item.dueDate < today) return { text: item.paid > 0 ? `▲ Late · ${formatPeso(item.paid)} paid` : '▲ Late', tone: 'text-red-800' }
  return { text: item.paid > 0 ? `${formatPeso(item.paid)} paid` : 'Not paid', tone: 'text-slate-600' }
}

/** + Plan adds the bill to the planned monthly expenses (the Plan line); ✓ In plan · Remove takes it out. */
function PlanToggle({ sheetId, workbook, payable, onSaved }: { sheetId: string; workbook: Workbook; payable: Payable; onSaved: (message: string) => void }) {
  const edit = useSheetEdit()
  const line = workbook.plannedExpenses.find((e) => e.active && e.payableId === payable.payableId)
  if (!line) {
    return (
      <Button
        variant="secondary"
        className="px-3 py-1.5"
        aria-label={`Add ${payable.name} to the plan`}
        onClick={() => {
          addPlannedExpense(sheetId, payable.name, payable.amount, payable.payableId)
          onSaved(`Added ${payable.name} to the plan.`)
        }}
      >
        + Plan
      </Button>
    )
  }
  async function remove(row: number, name: string, amount: number) {
    const message = `Removed ${payable.name} from the plan.`
    const ok = await edit.run(message, (sid, wb, token) => savePlannedExpense(sid, wb, row, { name, amount, active: false }, token))
    if (ok) onSaved(message)
  }
  return (
    <>
      <Button
        variant="secondary"
        className="px-3 py-1.5"
        aria-label={`Remove ${payable.name} from the plan`}
        disabled={line.row === 0 || edit.busy}
        onClick={() => void remove(line.row, line.name, line.amount)}
      >
        {edit.busy ? 'Removing…' : '✓ In plan · Remove'}
      </Button>
      <ErrorNote message={edit.error} />
    </>
  )
}

/** Delete a payable after a confirm. Payments already made stay. */
function DeleteBill({ workbook, payable, onSaved }: { workbook: Workbook; payable: Payable; onSaved: (message: string) => void }) {
  const del = useSheetEdit()
  const [asking, setAsking] = useState(false)
  async function remove() {
    const message = `Deleted ${payable.name}.`
    const ok = await del.run(message, (sid, wb, token) => stopPayable(sid, wb, payable.row, token))
    if (ok) onSaved(message)
  }
  if (!asking) {
    return (
      <button type="button" className="text-sm text-red-800 underline" onClick={() => setAsking(true)}>
        Delete
      </button>
    )
  }
  return (
    <div className="w-full rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alertdialog" aria-label={`Delete ${payable.name}`}>
      <p>
        <b>Delete {payable.name}?</b> It will not show in the coming months. Payments you already made stay in your records.
        {workbook.plannedExpenses.some((e) => e.active && e.payableId === payable.payableId) && ' It also leaves your plan.'}
      </p>
      <div className="mt-2 flex gap-2">
        <Button variant="danger" disabled={del.busy} onClick={() => void remove()}>
          {del.busy ? 'Deleting…' : 'Yes, delete'}
        </Button>
        <Button variant="secondary" disabled={del.busy} onClick={() => setAsking(false)}>
          Cancel
        </Button>
      </div>
      <ErrorNote message={del.error} />
    </div>
  )
}

/** The Edit pop-up: the edit form, then + Plan and Delete. */
function EditBill({ sheetId, workbook, item, onDone }: { sheetId: string; workbook: Workbook; item: PayableMonth; onDone: (message?: string) => void }) {
  const p = item.payable
  return (
    <div className="space-y-4">
      <EditPayableForm workbook={workbook} item={item} onDone={onDone} />
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
        {canPlan(workbook) && p.active && <PlanToggle sheetId={sheetId} workbook={workbook} payable={p} onSaved={onDone} />}
        <DeleteBill workbook={workbook} payable={p} onSaved={onDone} />
      </div>
    </div>
  )
}

function BillRow({ item, today, onOpen }: { item: PayableMonth; today: string; onOpen: (kind: 'pay' | 'edit') => void }) {
  const p = item.payable
  const s = status(item, today)
  const synced = p.row > 0
  const of = p.recurring && p.times ? ` (${item.number} of ${p.times})` : ''
  const due = (
    <>
      {shortDate(item.dueDate)}
      {item.month !== today.slice(0, 7) && ` (${monthLabel(item.month, false)})`}
    </>
  )
  return (
    <tr>
      <td className="py-2">
        <span className="font-medium text-slate-900">
          {p.name}
          {of && <span className="font-normal text-slate-500">{of}</span>}
        </span>
        <span className="block text-xs text-slate-500">{[p.payee, p.category, p.recurring ? 'monthly' : 'one time'].filter(Boolean).join(' · ')}</span>
        {/* Phones: due and status under the name. */}
        <span className="block text-xs sm:hidden">
          <span className="text-slate-500">Due {due} · </span>
          <span className={s.tone}>{s.text}</span>
        </span>
        {!synced && <span className="block text-xs text-slate-500">Saving to the sheet… Edit works after it syncs.</span>}
      </td>
      <td className="hidden py-2 pl-3 text-slate-700 sm:table-cell">{due}</td>
      <td className="py-2 pl-3 text-right font-semibold text-slate-900">
        {formatPeso(item.left > 0 ? item.left : item.amount)}
        {p.recurring && item.amountSet && <span className="block text-xs font-normal text-slate-500">usual {formatPeso(p.amount)}</span>}
      </td>
      <td className={`hidden py-2 pl-3 sm:table-cell ${s.tone}`}>{s.text}</td>
      <td className="py-2 pl-2 text-right whitespace-nowrap">
        {item.left > 0 && (
          <Button className="px-3 py-1" aria-label={`Pay ${p.name}`} onClick={() => onOpen('pay')}>
            Pay
          </Button>
        )}
        <button type="button" className={editButton} aria-label={`Edit ${p.name}`} disabled={!synced} onClick={() => onOpen('edit')}>
          Edit
        </button>
      </td>
    </tr>
  )
}

/** This month's bills and money owed outside the cards, in a table. Recurring payables come back each month by themselves. */
export function BillsView({ sheetId, workbook, today }: { sheetId: string; workbook: Workbook; today: string }) {
  const [open, setOpen] = useState<Open>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const month = today.slice(0, 7)
  const rows = billsThisMonth(workbook, today)
  const left = rows.reduce((s, r) => s + r.left, 0)
  const show = (next: Open) => {
    setSaved(null)
    setOpen(next)
  }
  const done = (message?: string) => {
    setOpen(null)
    if (message) setSaved(message)
  }
  const title = open === null ? '' : open.kind === 'add' ? 'Add payable' : `${open.kind === 'pay' ? 'Pay' : 'Edit'} ${open.item.payable.name}`
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Bills · {monthLabel(month)}</h1>
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <SectionHead title="This month" addLabel="+ Add payable" onAdd={() => show({ kind: 'add' })} />
        <p className="mt-1 text-sm text-slate-600">
          Left to pay this month: <b className="text-slate-900">{formatPeso(left)}</b>
        </p>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No bills this month. Add electric, water, internet, or money you owe with + Add payable.</p>
        ) : (
          <table className="mt-2 w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className={th}>Bill</th>
                <th className={`${th} hidden pl-3 sm:table-cell`}>Due</th>
                <th className={`${th} pl-3 text-right`}>Amount</th>
                <th className={`${th} hidden pl-3 sm:table-cell`}>Status</th>
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((item) => (
                <BillRow key={`${item.payable.payableId}-${item.month}`} item={item} today={today} onOpen={(kind) => show({ kind, item })} />
              ))}
            </tbody>
          </table>
        )}
        <SuccessNote message={saved} />
      </div>
      <p className="text-xs text-slate-500">
        Monthly payables come back by themselves on the 1st of each month. Card bills are on Cards.{' '}
        {canPlan(workbook) ? (
          <>
            Edit a bill to add it to your <Link to="/plan" className="underline">planned monthly expenses</Link> with + Plan, until its last payment.
          </>
        ) : (
          'To add bills to your plan, open Settings → Update sheet.'
        )}
      </p>
      <Modal title={title} open={open !== null} onClose={() => setOpen(null)}>
        {open?.kind === 'add' && (
          <>
            <p className="mb-3 text-xs text-slate-500">A bill (electric, water, internet) or money you owe a person. Every month or one time.</p>
            <AddPayableForm sheetId={sheetId} workbook={workbook} onSaved={done} />
          </>
        )}
        {open?.kind === 'pay' && <PayForm key={`pay-${open.item.payable.payableId}-${open.item.month}`} sheetId={sheetId} workbook={workbook} item={open.item} onDone={done} />}
        {open?.kind === 'edit' && (
          <EditBill key={`edit-${open.item.payable.payableId}-${open.item.month}`} sheetId={sheetId} workbook={workbook} item={open.item} onDone={done} />
        )}
      </Modal>
    </section>
  )
}

export function BillsPage() {
  return (
    <WithWorkbook title="Bills">
      {(sheetId, workbook) =>
        workbook.updates.some((u) => PAYABLE_TABS.includes(u.tab)) ? (
          <section className="space-y-4">
            <h1 className="text-2xl font-semibold text-slate-900">Bills</h1>
            <SheetUpdateCard workbook={workbook} why="Bills and money you owe need new tabs in your sheet." />
          </section>
        ) : (
          <BillsView sheetId={sheetId} workbook={workbook} today={todayIso()} />
        )
      }
    </WithWorkbook>
  )
}
