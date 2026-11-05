import { useState } from 'react'
import { stopPayable } from '../../data/actions'
import { todayIso } from '../../domain/dues'
import { addMonths, payableMonths, payableProgress, type PayableMonth } from '../../domain/payables'
import type { Payable, Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { useSheetEdit } from '../../state/hooks'
import { monthLabel } from '../../ui/charts/palette'
import { ErrorNote } from '../../ui/ErrorNote'
import { SheetUpdateCard } from '../settings/SheetUpdateCard'
import { WithWorkbook } from '../WithWorkbook'
import { AddPayableForm, PayForm, SetAmountForm } from './PayableForms'

const panel = 'rounded-xl bg-white p-4 shadow-sm'
const PAYABLE_TABS = ['Payables', 'PayableAmounts', 'Transactions']

function MonthRow({ sheetId, workbook, item, today }: { sheetId: string; workbook: Workbook; item: PayableMonth; today: string }) {
  const [open, setOpen] = useState<'pay' | 'amount' | null>(null)
  const p = item.payable
  const late = item.left > 0 && item.dueDate < today
  const of = p.recurring && p.times ? ` · ${item.number} of ${p.times}` : ''
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span>
          <span className="font-medium text-slate-900">{p.name}</span>
          {p.payee && <span className="text-slate-500"> · {p.payee}</span>}
          <span className={`block text-xs ${late ? 'text-red-800' : 'text-slate-500'}`}>
            {late ? '▲ Late · ' : ''}Due {item.dueDate}
            {of}
            {p.recurring && !item.amountSet && item.paid === 0 && ' · usual amount'}
          </span>
        </span>
        <span className="text-right">
          <b className="text-slate-900">{formatPeso(item.left > 0 ? item.left : item.amount)}</b>
          <span className={`block text-xs ${item.left === 0 ? 'text-green-900' : 'text-slate-500'}`}>
            {item.left === 0 ? '✓ Paid' : item.paid > 0 ? `${formatPeso(item.paid)} paid` : 'Not paid'}
          </span>
        </span>
      </div>
      {item.left > 0 && open === null && (
        <div className="mt-2 flex gap-3 text-sm">
          <button type="button" className="font-medium text-green-900 underline" onClick={() => setOpen('pay')}>
            Pay
          </button>
          {p.recurring && item.paid === 0 && (
            <button type="button" className="text-green-900 underline" onClick={() => setOpen('amount')}>
              Set this month&apos;s amount
            </button>
          )}
        </div>
      )}
      {open === 'pay' && <PayForm sheetId={sheetId} workbook={workbook} item={item} onDone={() => setOpen(null)} />}
      {open === 'amount' && <SetAmountForm sheetId={sheetId} item={item} onDone={() => setOpen(null)} />}
    </li>
  )
}

function MonthList({ title, items, sheetId, workbook, today, empty }: { title: string; items: PayableMonth[]; sheetId: string; workbook: Workbook; today: string; empty?: string }) {
  if (items.length === 0 && !empty) return null
  const left = items.reduce((s, i) => s + i.left, 0)
  return (
    <div className={panel}>
      <h2 className="flex items-baseline justify-between font-medium text-slate-900">
        {title}
        {left > 0 && <span className="text-sm font-normal text-slate-600">{formatPeso(left)} left</span>}
      </h2>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-slate-600">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {items.map((item) => (
            <MonthRow key={`${item.payable.payableId}-${item.month}`} sheetId={sheetId} workbook={workbook} item={item} today={today} />
          ))}
        </ul>
      )}
    </div>
  )
}

function PayableItem({ workbook, payable, today }: { workbook: Workbook; payable: Payable; today: string }) {
  const edit = useSheetEdit()
  const progress = payableProgress(workbook, payable, today)
  const how = payable.recurring
    ? `${formatPeso(payable.amount)} every month${payable.dueDay ? ` on day ${payable.dueDay}` : ''} from ${monthLabel(payable.startMonth)}`
    : `${formatPeso(payable.amount)} one time`
  const status = progress.times ? `${progress.paidTimes} of ${progress.times} paid · ${formatPeso(progress.left)} left` : 'No end date'
  return (
    <li className="py-2">
      <p className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-slate-900">
          {payable.name}
          {payable.payee && <span className="font-normal text-slate-500"> · {payable.payee}</span>}
        </span>
        <span className="text-xs text-slate-600">{status}</span>
      </p>
      <p className="text-xs text-slate-500">
        {how} · {payable.category}
      </p>
      {payable.row > 0 && (
        <button
          type="button"
          className="mt-1 text-xs text-slate-500 underline"
          disabled={edit.busy}
          onClick={() => void edit.run(`Stopped ${payable.name}.`, (sheetId, wb, token) => stopPayable(sheetId, wb, payable.row, token))}
        >
          {edit.busy ? 'Saving…' : 'Stop (no more months)'}
        </button>
      )}
      <ErrorNote message={edit.error} />
    </li>
  )
}

/** Bills and money owed outside the credit cards: late, this month, next month, the list, and Add payable. */
export function BillsPage() {
  return (
    <WithWorkbook title="Bills">
      {(sheetId, workbook) => {
        const today = todayIso()
        const month = today.slice(0, 7)
        const needsUpdate = workbook.updates.some((u) => PAYABLE_TABS.includes(u.tab))
        const months = payableMonths(workbook, addMonths(month, 1))
        const late = months.filter((m) => m.month < month && m.left > 0)
        const current = months.filter((m) => m.month === month)
        const next = months.filter((m) => m.month === addMonths(month, 1))
        const active = workbook.payables.filter((p) => p.active)
        return (
          <section className="space-y-4">
            <h1 className="text-2xl font-semibold text-slate-900">Bills</h1>
            {needsUpdate ? (
              <SheetUpdateCard workbook={workbook} why="Bills and money you owe need new tabs in your sheet." />
            ) : (
              <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
                <div className="space-y-4">
                  <MonthList title="Late" items={late} sheetId={sheetId} workbook={workbook} today={today} />
                  <MonthList title={monthLabel(month)} items={current} sheetId={sheetId} workbook={workbook} today={today} empty="Nothing for this month yet. Add a payable below." />
                  <MonthList title={`Next: ${monthLabel(addMonths(month, 1))}`} items={next} sheetId={sheetId} workbook={workbook} today={today} />
                </div>
                <div className="space-y-4">
                  {active.length > 0 && (
                    <div className={panel}>
                      <h2 className="font-medium text-slate-900">Your payables</h2>
                      <ul className="divide-y divide-slate-100 text-sm">
                        {active.map((p) => (
                          <PayableItem key={p.payableId} workbook={workbook} payable={p} today={today} />
                        ))}
                      </ul>
                    </div>
                  )}
                  <details className={panel} open={active.length === 0}>
                    <summary className="cursor-pointer font-medium text-slate-900">Add payable</summary>
                    <p className="mt-1 mb-3 text-xs text-slate-500">A bill (electric, water, internet) or money you owe a person. Every month or one time.</p>
                    <AddPayableForm sheetId={sheetId} workbook={workbook} />
                  </details>
                </div>
              </div>
            )}
          </section>
        )
      }}
    </WithWorkbook>
  )
}
