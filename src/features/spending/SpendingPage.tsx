import { useState } from 'react'
import { accountLabel } from '../../domain/accounts'
import { entries, entryAccounts, entryMonths, filterEntries, KIND_LABEL, totalsByKind, type Entry, type EntryKind } from '../../domain/activity'
import { todayIso } from '../../domain/dues'
import { plannedLiving } from '../../domain/payoff'
import type { SpendingItem } from '../../domain/reconcile'
import { categoryOf, spendingByCategory, type CategorySpending } from '../../domain/spending'
import type { IsoDate, Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { monthLabel, OTHER_COLOR, STATUS } from '../../ui/charts/palette'
import { Field, Select, SuccessNote, TextInput } from '../../ui/form'
import { Modal } from '../../ui/Modal'
import { EntryCorrection, ItemDialogBody } from './ItemDialog'
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


const KINDS: EntryKind[] = ['purchase', 'in', 'move', 'payment']
const KIND_PLURAL: Record<EntryKind, string> = { purchase: 'Purchases', in: 'Money in', move: 'Moves', payment: 'Card payments' }

/** The second line of a row: date, kind, and where the money went. */
function entryDetail(workbook: Workbook, e: Entry): string {
  if (e.item) return `${shortDay(e.date)} · ${categoryOf(e.item)} · ${accountLabel(workbook, e.from)} · ${SOURCE[e.item.source]}`
  const where = e.kind === 'in' ? `to ${accountLabel(workbook, e.to)}` : e.kind === 'payment' ? `from ${accountLabel(workbook, e.from)}` : ''
  return [shortDay(e.date), KIND_LABEL[e.kind], where, e.note].filter(Boolean).join(' · ')
}

function EntryList({ workbook, list, onOpen }: { workbook: Workbook; list: Entry[]; onOpen: (entry: Entry) => void }) {
  if (list.length === 0) return <p className="text-sm text-slate-500">Nothing here.</p>
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {list.map((e) => {
        const label = e.label || '(no description)'
        const moneyIn = e.kind === 'in' || (e.kind === 'purchase' && e.amount < 0)
        return (
          <li key={e.key}>
            <button
              type="button"
              onClick={() => onOpen(e)}
              aria-label={`${label} ${formatPeso(e.amount)}: ${e.item ? 'correct or void' : 'details'}`}
              className="-mx-2 flex w-[calc(100%+1rem)] items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-900">{label}</span>
                <span className="block text-xs text-slate-500">{entryDetail(workbook, e)}</span>
              </span>
              <span className={`shrink-0 ${moneyIn ? 'text-green-900' : e.kind === 'purchase' ? 'text-slate-800' : 'text-slate-500'}`}>
                {e.kind === 'in' ? '+' : ''}
                {formatPeso(e.amount)}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** A move, money in, or card payment: its details, and void (e.g. entered twice). Other changes are made in the sheet. */
function EntryDetails({ workbook, entry: e, onSaved }: { workbook: Workbook; entry: Entry; onSaved: (message: string) => void }) {
  const from = e.kind === 'in' ? e.label : accountLabel(workbook, e.from)
  return (
    <div className="space-y-3 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-slate-500">What</dt>
        <dd className="text-slate-900">{KIND_LABEL[e.kind]}</dd>
        <dt className="text-slate-500">Date</dt>
        <dd className="text-slate-900">{shortDay(e.date)}</dd>
        <dt className="text-slate-500">Amount</dt>
        <dd className="text-slate-900">{formatPeso(e.amount)}</dd>
        <dt className="text-slate-500">From</dt>
        <dd className="text-slate-900">{from}</dd>
        <dt className="text-slate-500">To</dt>
        <dd className="text-slate-900">{accountLabel(workbook, e.to)}</dd>
        {e.note && (
          <>
            <dt className="text-slate-500">Note</dt>
            <dd className="text-slate-900">{e.note}</dd>
          </>
        )}
      </dl>
      <p className="text-slate-600">Not spending.</p>
      {e.ref && <EntryCorrection workbook={workbook} entry={e} onSaved={onSaved} />}
    </div>
  )
}

/** Every entry once (purchases, money in, moves, card payments), with filters, month totals, and budget vs actual. */
export function SpendingView({ workbook, today }: { workbook: Workbook; today: IsoDate }) {
  const all = entries(workbook)
  const [open, setOpen] = useState<Entry | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  // '' is all months.
  const [month, setMonth] = useState(today.slice(0, 7))
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<EntryKind | ''>('')
  const [accountId, setAccountId] = useState('')
  const [category, setCategory] = useState('')
  const inMonth = filterEntries(all, { month, kind: '', accountId: '', category: '' })
  const forAccount = filterEntries(inMonth, { month, kind: '', accountId, category: '' })
  const shown = filterEntries(forAccount, { month, kind, accountId, category, search })
  const purchases = forAccount.flatMap((e) => (e.item ? [e.item] : []))
  const rows = spendingByCategory(workbook, purchases)
  const totals = totalsByKind(forAccount)
  const plan = month ? plannedLiving(workbook, month) : null
  const movedIn = forAccount.filter((e) => e.kind === 'move' && e.to === accountId).reduce((s, e) => s + e.amount, 0)
  // Keep a chosen filter in its list after the month changes, so the select shows what is filtered.
  const accounts = entryAccounts(workbook, inMonth)
  if (accountId && !accounts.some((o) => o.value === accountId)) accounts.push({ value: accountId, label: accountLabel(workbook, accountId) })
  const categories = rows.map((r) => r.category)
  if (category && !categories.includes(category)) categories.push(category)

  function chooseCategory(value: string) {
    setCategory(value)
    if (value) setKind('purchase')
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Transactions</h1>
      <div className={panel}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label="Month" htmlFor="sp-month">
            <Select id="sp-month" value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">All months</option>
              {entryMonths(all, today.slice(0, 7)).map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type" htmlFor="sp-kind">
            <Select
              id="sp-kind"
              value={kind}
              onChange={(e) => {
                const value = e.target.value as EntryKind | ''
                setKind(value)
                if (value !== 'purchase') setCategory('')
              }}
            >
              <option value="">All</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_PLURAL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Account" htmlFor="sp-account">
            <Select id="sp-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">All</option>
              {accounts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category" htmlFor="sp-category">
            <Select id="sp-category" value={category} onChange={(e) => chooseCategory(e.target.value)}>
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="mt-3 text-xs text-slate-500">Spent {month ? `in ${monthLabel(month)}` : 'in all months'}{accountId && ` from ${accountLabel(workbook, accountId)}`}</p>
        <p className="text-3xl font-semibold text-slate-900">{formatPeso(totals.purchase)}</p>
        {plan !== null && plan > 0 && !accountId && (
          <p className={`text-sm ${totals.purchase > plan ? 'text-red-800' : 'text-slate-700'}`}>
            {Math.round((totals.purchase / plan) * 100)}% of the Plan ({formatPeso(plan)} for the month)
            {totals.purchase > plan ? ` · ${formatPeso(totals.purchase - plan)} over` : ` · ${formatPeso(plan - totals.purchase)} left`}
          </p>
        )}
        <p className="mt-1 text-sm text-slate-700" aria-label="Month totals">
          Money in <b className="text-green-900">{formatPeso(totals.in)}</b>
          {accountId ? (
            <>
              {' '}
              · Moved in <b className="text-slate-900">{formatPeso(movedIn)}</b> · Moved out <b className="text-slate-900">{formatPeso(totals.move - movedIn)}</b>
            </>
          ) : (
            <>
              {' '}
              · Moved <b className="text-slate-900">{formatPeso(totals.move)}</b>
            </>
          )}{' '}
          · Card payments <b className="text-slate-900">{formatPeso(totals.payment)}</b>
        </p>
        <p className="text-xs text-slate-500">
          {purchases.length} {purchases.length === 1 ? 'purchase' : 'purchases'}. Moves, card payments, and installments are not spending.
        </p>
      </div>
      <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-6 lg:space-y-0">
        <BudgetCard rows={rows} selected={category} onSelect={chooseCategory} />
        <div className={panel}>
          <h2 className="mb-2 font-medium text-slate-900">
            {kind ? KIND_PLURAL[kind] : 'All entries'}
            {category && ` · ${category}`}
            {(category || kind) && (
              <button
                type="button"
                className="ml-2 text-sm font-normal text-green-900 underline"
                onClick={() => {
                  setCategory('')
                  setKind('')
                }}
              >
                Show all
              </button>
            )}
          </h2>
          <Field label="Search" htmlFor="sp-search">
            <TextInput id="sp-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. Savemore, Grab, GCash" />
          </Field>
          {search && (
            <p className="mt-1 text-xs text-slate-500">
              {shown.length} found in {month ? monthLabel(month) : 'all months'}.{month && ' To look in every month, choose All months.'}
            </p>
          )}
          <p className="mt-2 mb-2 text-xs text-slate-500">Tap an entry to see it, correct it, or void it.</p>
          <SuccessNote message={saved} />
          <EntryList
            workbook={workbook}
            list={shown}
            onOpen={(entry) => {
              setSaved(null)
              setOpen(entry)
            }}
          />
        </div>
      </div>
      <Modal title={open ? (open.item ? open.label || 'Purchase' : KIND_LABEL[open.kind]) : ''} open={open !== null} onClose={() => setOpen(null)}>
        {open?.item ? (
          <ItemDialogBody
            key={open.key}
            workbook={workbook}
            item={open.item}
            onSaved={(message) => {
              setOpen(null)
              setSaved(message)
            }}
          />
        ) : (
          open && (
            <EntryDetails
              key={open.key}
              workbook={workbook}
              entry={open}
              onSaved={(message) => {
                setOpen(null)
                setSaved(message)
              }}
            />
          )
        )}
      </Modal>
    </section>
  )
}

export function SpendingPage() {
  return <WithWorkbook title="Transactions">{(_sheetId, workbook) => <SpendingView workbook={workbook} today={todayIso()} />}</WithWorkbook>
}
