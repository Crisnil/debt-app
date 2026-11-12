import { useState } from 'react'
import { accountLabel } from '../../domain/accounts'
import { todayIso } from '../../domain/dues'
import { plannedLiving } from '../../domain/payoff'
import { spendingItems, type SpendingItem } from '../../domain/reconcile'
import { categoryOf, filterSpending, paidFromOptions, spendingByCategory, spendingMonths, type CategorySpending } from '../../domain/spending'
import type { IsoDate, Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { monthLabel, OTHER_COLOR, STATUS } from '../../ui/charts/palette'
import { Field, Select, SuccessNote } from '../../ui/form'
import { Modal } from '../../ui/Modal'
import { ItemDialogBody } from './ItemDialog'
import { WithWorkbook } from '../WithWorkbook'

const panel = 'rounded-xl bg-white p-4 shadow-sm'

const shortDay = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })

const SOURCE: Record<SpendingItem['source'], string> = {
  both: 'logged · on statement ✓',
  expense: 'logged',
  statement: 'on statement',
  check: 'lower than the app balance',
}

/** Over, near, or within the budget: a status color with an icon and a word. Null without a budget. */
function budgetStatus(row: CategorySpending): { fill: string; sign: string } | null {
  if (row.budget === 0) return null
  const ratio = row.spent / row.budget
  if (ratio > 1) return { fill: STATUS.bad.fill, sign: `${STATUS.bad.icon} over` }
  if (ratio > 0.9) return { fill: STATUS.watch.fill, sign: `${STATUS.watch.icon} near` }
  return { fill: STATUS.good.fill, sign: STATUS.good.icon }
}

function BudgetCard({ rows, selected, onSelect }: { rows: CategorySpending[]; selected: string; onSelect: (category: string) => void }) {
  const budget = rows.reduce((s, r) => s + r.budget, 0)
  const spent = rows.reduce((s, r) => s + r.spent, 0)
  const scale = Math.max(...rows.map((r) => Math.max(r.spent, r.budget)), 1)
  return (
    <div className={panel}>
      <h2 className="font-medium text-slate-900">Budget vs actual</h2>
      <p className="mb-3 text-xs text-slate-500">
        Monthly budget = weekly budget in the Categories tab × 52 ÷ 12.
        {budget > 0 && ` Total budget ${formatPeso(budget)}, spent ${formatPeso(spent)}.`} ▲ over · ! near (more than 90%) · ✓ within. Tap a
        category to see its purchases.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No spending this month.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((r) => {
            const status = budgetStatus(r)
            return (
            <li key={r.category}>
              <button
                type="button"
                aria-pressed={selected === r.category}
                onClick={() => onSelect(selected === r.category ? '' : r.category)}
                className={`w-full rounded-lg p-2 text-left ${selected === r.category ? 'bg-green-50' : 'hover:bg-slate-50'}`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-900">{r.category}</span>
                  <span className="text-slate-800">
                    {formatPeso(r.spent)}
                    <span className="text-xs text-slate-500">{r.budget > 0 ? ` of ${formatPeso(r.budget)}` : ' · no budget'}</span>
                    {status && <span className="ml-1 text-xs text-slate-600">{status.sign}</span>}
                  </span>
                </span>
                <span className="relative mt-1 block h-2 rounded-full bg-slate-100">
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(Math.max(r.spent, 0) / scale) * 100}%`, background: status?.fill ?? OTHER_COLOR }} />
                  {r.budget > 0 && <span className="absolute -inset-y-0.5 w-0.5 bg-slate-700" style={{ left: `${(r.budget / scale) * 100}%` }} />}
                </span>
              </button>
            </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function PurchaseList({ workbook, items, onOpen }: { workbook: Workbook; items: SpendingItem[]; onOpen: (item: SpendingItem) => void }) {
  if (items.length === 0) return <p className="text-sm text-slate-500">Nothing here.</p>
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {items.map((i, n) => (
        <li key={`${i.date}-${i.methodId}-${i.label}-${n}`}>
          <button
            type="button"
            onClick={() => onOpen(i)}
            aria-label={`${i.label || '(no description)'} ${formatPeso(i.amount)}: correct or void`}
            className="-mx-2 flex w-[calc(100%+1rem)] items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-slate-900">{i.label || '(no description)'}</span>
              <span className="block text-xs text-slate-500">
                {shortDay(i.date)} · {categoryOf(i)} · {accountLabel(workbook, i.methodId)} · {SOURCE[i.source]}
              </span>
            </span>
            <span className={`shrink-0 ${i.amount < 0 ? 'text-green-900' : 'text-slate-800'}`}>{formatPeso(i.amount)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Every purchase once (card statements + entries), with filters and budget vs actual per category. */
export function SpendingView({ workbook, today }: { workbook: Workbook; today: IsoDate }) {
  const all = spendingItems(workbook)
  const [open, setOpen] = useState<SpendingItem | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [methodId, setMethodId] = useState('')
  const [category, setCategory] = useState('')
  const inMonth = filterSpending(all, { month, methodId: '', category: '' })
  const forMethod = filterSpending(inMonth, { month, methodId, category: '' })
  const shown = filterSpending(forMethod, { month, methodId, category })
  const rows = spendingByCategory(workbook, forMethod)
  const total = forMethod.reduce((s, i) => s + i.amount, 0)
  const plan = plannedLiving(workbook, month)
  // Keep a chosen filter in its list after the month changes, so the select shows what is filtered.
  const methods = paidFromOptions(workbook, inMonth)
  if (methodId && !methods.some((o) => o.value === methodId)) methods.push({ value: methodId, label: accountLabel(workbook, methodId) })
  const categories = rows.map((r) => r.category)
  if (category && !categories.includes(category)) categories.push(category)

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Spending</h1>
      <div className={panel}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Field label="Month" htmlFor="sp-month">
            <Select id="sp-month" value={month} onChange={(e) => setMonth(e.target.value)}>
              {spendingMonths(all, today.slice(0, 7)).map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Paid from" htmlFor="sp-method">
            <Select id="sp-method" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
              <option value="">All</option>
              {methods.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category" htmlFor="sp-category">
            <Select id="sp-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="mt-3 text-3xl font-semibold text-slate-900">{formatPeso(total)}</p>
        {plan !== null && plan > 0 && !methodId && (
          <p className={`text-sm ${total > plan ? 'text-red-800' : 'text-slate-700'}`}>
            {Math.round((total / plan) * 100)}% of the Plan ({formatPeso(plan)} for the month)
            {total > plan ? ` · ${formatPeso(total - plan)} over` : ` · ${formatPeso(plan - total)} left`}
          </p>
        )}
        <p className="text-xs text-slate-500">
          Spent in {monthLabel(month)}
          {methodId && ` from ${accountLabel(workbook, methodId)}`} · {forMethod.length} {forMethod.length === 1 ? 'purchase' : 'purchases'}. Installments and
          card payments are not spending.
        </p>
      </div>
      <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-6 lg:space-y-0">
        <BudgetCard rows={rows} selected={category} onSelect={setCategory} />
        <div className={panel}>
          <h2 className="mb-2 font-medium text-slate-900">
            Purchases{category && ` · ${category}`}
            {category && (
              <button type="button" className="ml-2 text-sm font-normal text-green-900 underline" onClick={() => setCategory('')}>
                Show all
              </button>
            )}
          </h2>
          <p className="mb-2 text-xs text-slate-500">Tap a purchase to correct or void it.</p>
          <SuccessNote message={saved} />
          <PurchaseList
            workbook={workbook}
            items={shown}
            onOpen={(item) => {
              setSaved(null)
              setOpen(item)
            }}
          />
        </div>
      </div>
      <Modal title={open ? open.label || 'Purchase' : ''} open={open !== null} onClose={() => setOpen(null)}>
        {open && (
          <ItemDialogBody
            key={`${open.date}-${open.label}-${open.amount}`}
            workbook={workbook}
            item={open}
            onSaved={(message) => {
              setOpen(null)
              setSaved(message)
            }}
          />
        )}
      </Modal>
    </section>
  )
}

export function SpendingPage() {
  return <WithWorkbook title="Spending">{(_sheetId, workbook) => <SpendingView workbook={workbook} today={todayIso()} />}</WithWorkbook>
}
