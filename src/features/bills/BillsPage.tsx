import { useState } from 'react'
import { stopPayable } from '../../data/actions'
import { todayIso } from '../../domain/dues'
import { billsThisMonth, type PayableMonth } from '../../domain/payables'
import type { Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { useSheetEdit } from '../../state/hooks'
import { Button } from '../../ui/Button'
import { monthLabel } from '../../ui/charts/palette'
import { ErrorNote } from '../../ui/ErrorNote'
import { SheetUpdateCard } from '../settings/SheetUpdateCard'
import { WithWorkbook } from '../WithWorkbook'
import { AddPayableForm, EditPayableForm, PayForm } from './PayableForms'

const PAYABLE_TABS = ['Payables', 'PayableAmounts', 'Transactions']
// Columns: #, name, due, amount, status, actions. On phones the row stacks.
const COLS = 'md:grid md:grid-cols-[2rem_minmax(0,2fr)_6rem_8rem_8rem_minmax(0,14rem)] md:items-center md:gap-3'

const shortDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })

function status(item: PayableMonth, today: string): { text: string; tone: string } {
  if (item.left === 0) return { text: '✓ Paid', tone: 'text-green-900' }
  if (item.dueDate < today) return { text: item.paid > 0 ? `▲ Late · ${formatPeso(item.paid)} paid` : '▲ Late', tone: 'text-red-800' }
  return { text: item.paid > 0 ? `${formatPeso(item.paid)} paid` : 'Not paid', tone: 'text-slate-600' }
}

function BillRow({ sheetId, workbook, item, index, today }: { sheetId: string; workbook: Workbook; item: PayableMonth; index: number; today: string }) {
  const [open, setOpen] = useState<'pay' | 'edit' | 'delete' | null>(null)
  const del = useSheetEdit()
  const p = item.payable
  const s = status(item, today)
  const synced = p.row > 0
  const of = p.recurring && p.times ? ` (${item.number} of ${p.times})` : ''
  return (
    <li className="border-t border-slate-100 py-3 first:border-0">
      <div className={COLS}>
        <span className="hidden text-sm text-slate-500 md:block">{item.month < today.slice(0, 7) ? '▲' : index}</span>
        <div className="min-w-0">
          <p className="font-medium text-slate-900">
            {p.name}
            {of && <span className="font-normal text-slate-500">{of}</span>}
          </p>
          <p className="truncate text-xs text-slate-500">
            {[p.payee, p.category, p.recurring ? 'monthly' : 'one time'].filter(Boolean).join(' · ')}
          </p>
        </div>
        {/* Phones: due, amount, and status on one line. Wide screens: three table columns. */}
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 md:contents">
          <p className="text-sm text-slate-700">
            <span className="text-slate-500 md:hidden">Due </span>
            {shortDate(item.dueDate)}
            {item.month !== today.slice(0, 7) && <span className="text-xs text-slate-500"> ({monthLabel(item.month, false)})</span>}
          </p>
          <p className="text-sm font-semibold text-slate-900 md:text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatPeso(item.left > 0 ? item.left : item.amount)}
            {p.recurring && item.amountSet && <span className="text-xs font-normal text-slate-500 md:block"> usual {formatPeso(p.amount)}</span>}
          </p>
          <p className={`text-sm ${s.tone}`}>{s.text}</p>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 md:mt-0 md:justify-end">
          {item.left > 0 && (
            <Button className="px-3 py-1.5" onClick={() => setOpen(open === 'pay' ? null : 'pay')}>
              Pay
            </Button>
          )}
          <Button variant="secondary" className="px-3 py-1.5" disabled={!synced} onClick={() => setOpen(open === 'edit' ? null : 'edit')}>
            Edit
          </Button>
          <Button variant="danger" className="px-3 py-1.5" disabled={!synced} onClick={() => setOpen(open === 'delete' ? null : 'delete')}>
            Delete
          </Button>
        </div>
      </div>
      {!synced && <p className="mt-1 text-xs text-slate-500">Saving to the sheet… Edit and Delete work after it syncs.</p>}
      {open === 'pay' && <PayForm sheetId={sheetId} workbook={workbook} item={item} onDone={() => setOpen(null)} />}
      {open === 'edit' && <EditPayableForm workbook={workbook} item={item} onDone={() => setOpen(null)} />}
      {open === 'delete' && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alertdialog" aria-label={`Delete ${p.name}`}>
          <p>
            <b>Delete {p.name}?</b> It will not show in the coming months. Payments you already made stay in your records.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              variant="danger"
              disabled={del.busy}
              onClick={() => void del.run(`Deleted ${p.name}.`, (sid, wb, token) => stopPayable(sid, wb, p.row, token))}
            >
              {del.busy ? 'Deleting…' : 'Yes, delete'}
            </Button>
            <Button variant="secondary" disabled={del.busy} onClick={() => setOpen(null)}>
              Cancel
            </Button>
          </div>
          <ErrorNote message={del.error} />
        </div>
      )}
    </li>
  )
}

/** This month's bills and money owed outside the cards, in a table. Recurring payables come back each month by themselves. */
export function BillsView({ sheetId, workbook, today }: { sheetId: string; workbook: Workbook; today: string }) {
  const [adding, setAdding] = useState(false)
  const month = today.slice(0, 7)
  const rows = billsThisMonth(workbook, today)
  const left = rows.reduce((s, r) => s + r.left, 0)
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Bills · {monthLabel(month)}</h1>
        <Button onClick={() => setAdding(!adding)} aria-expanded={adding}>
          {adding ? 'Close' : '+ Add payable'}
        </Button>
      </div>
      {adding && (
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs text-slate-500">A bill (electric, water, internet) or money you owe a person. Every month or one time.</p>
          <AddPayableForm sheetId={sheetId} workbook={workbook} />
        </div>
      )}
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-600">
          Left to pay this month: <b className="text-slate-900">{formatPeso(left)}</b>
        </p>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No bills this month. Add electric, water, internet, or money you owe with + Add payable.</p>
        ) : (
          <>
            <div className={`mt-3 hidden border-b border-slate-200 pb-2 text-xs text-slate-500 md:grid ${COLS}`} aria-hidden="true">
              <span>#</span>
              <span>Name · pay to</span>
              <span>Due</span>
              <span className="text-right">Amount</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="mt-1">
              {rows.map((item, i) => (
                <BillRow key={`${item.payable.payableId}-${item.month}`} sheetId={sheetId} workbook={workbook} item={item} index={i + 1} today={today} />
              ))}
            </ul>
          </>
        )}
      </div>
      <p className="text-xs text-slate-500">Monthly payables come back by themselves on the 1st of each month. Card bills are on Cards.</p>
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
