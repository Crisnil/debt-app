import { useState } from 'react'
import { Link } from 'react-router-dom'
import { addIncome } from '../../data/actions'
import { accountLabel, byGroup, TYPE_LABEL } from '../../domain/accounts'
import { accountsToCheck } from '../../domain/balances'
import { moneyParts, moneyTotals } from '../../domain/home'
import { incomeTypeFor, paydaysToRecord, type Payday } from '../../domain/payday'
import type { IsoDate, Workbook } from '../../domain/types'
import type { RefreshState } from '../../state/hooks'
import { formatPeso, toPesos } from '../../lib/money'
import { Button } from '../../ui/Button'
import { TextInput } from '../../ui/form'
import { parsePositiveAmount } from '../add/parseAmount'

const panel = 'rounded-xl bg-white p-4 shadow-sm'
const shortDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })

/** What we have: the total, savings goal and spendable now, then each account's balance, grouped Debit, E-wallet, Cash. */
export function WhatWeHave({ workbook, today, refresh }: { workbook: Workbook; today: IsoDate; refresh?: RefreshState }) {
  const parts = moneyParts(workbook)
  if (parts.length === 0) return null
  const canCheck = !workbook.updates.some((u) => u.tab === 'BalanceChecks' && u.create)
  const unchecked = canCheck ? accountsToCheck(workbook, today.slice(0, 7)) : []
  const totals = moneyTotals(parts)
  // Grouped Debit, E-wallet, Cash; in each group by the account's row in the Accounts tab, not its size.
  const order = workbook.accounts.filter((a) => a.type !== 'credit_card').map((a) => a.accountId)
  const inSheetOrder = byGroup(
    [...parts].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
    (p) => p.type,
  )
  const groups = [...new Set(inSheetOrder.map((p) => p.type))].map((type) => ({ type, parts: inSheetOrder.filter((p) => p.type === type) }))
  return (
    <div className={panel}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-medium text-slate-900">What we have</h2>
        <span className="flex items-center gap-3 text-sm">
          {refresh && <RefreshButton state={refresh} />}
          <Link to="/balances" className="rounded-full border border-green-900 px-3 py-1 font-medium text-green-900 active:bg-green-50">
            Check balances
          </Link>
          <Link to="/settings" className="text-green-900 underline">
            Accounts
          </Link>
        </span>
      </div>
      <p className="text-2xl font-semibold text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatPeso(totals.total)}
      </p>
      <p className="mb-3 text-sm text-slate-600">
        Savings goal: <b className="text-slate-900">{formatPeso(totals.savings)}</b> · Spendable now: <b className="text-slate-900">{formatPeso(totals.spendable)}</b>
      </p>
      <div className="space-y-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {groups.map((g) => (
          <div key={g.type}>
            <h3 className="flex justify-between border-b border-slate-100 pb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
              <span>{TYPE_LABEL[g.type]}</span>
              <span>{formatPeso(g.parts.reduce((s, p) => s + Math.max(p.amount, 0), 0))}</span>
            </h3>
            <ul className="divide-y divide-slate-50">
              {g.parts.map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                  <span className="min-w-0">
                    <span className="text-slate-800">{`${p.name}${p.isSavings ? ' · savings goal' : ''}`}</span>
                    {p.maintaining > 0 && <span className="block text-xs text-slate-500">🔒 {formatPeso(p.maintaining)} maintaining</span>}
                  </span>
                  <span className={p.amount < 0 ? 'text-red-800' : 'text-slate-900'}>{formatPeso(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {parts.some((p) => p.amount < 0) && <p className="mt-2 text-xs text-amber-900">! An account shows less than ₱0. Check its starting balance in Settings.</p>}
      {unchecked.length > 0 && (
        <p className="mt-2 text-sm text-slate-700">
          Not checked this month: {unchecked.map((a) => a.label).join(', ')} ·{' '}
          <Link to="/balances" className="text-green-900 underline">
            Check now
          </Link>
        </p>
      )}
      {refresh && <RefreshStatus state={refresh} />}
      <p className="mt-2 text-xs text-slate-500">
        Balances count from each account&apos;s last balance check (or starting balance). Record paydays so they stay right.
      </p>
    </div>
  )
}

const timeOf = (date: Date) => date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })

/** ↻: sends waiting entries and reloads the sheet. Spins while it works. */
function RefreshButton({ state }: { state: RefreshState }) {
  return (
    <button
      type="button"
      aria-label="Refresh balances"
      title="Refresh balances"
      disabled={state.busy}
      onClick={state.refresh}
      className="-m-1 rounded-full p-1 text-green-900 hover:bg-green-50 disabled:opacity-60"
    >
      <svg viewBox="0 0 24 24" className={`h-4 w-4 ${state.busy ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
      </svg>
    </button>
  )
}

/** What the last refresh did: updated at, entries still waiting, or the problem. */
function RefreshStatus({ state }: { state: RefreshState }) {
  const parts = [
    state.busy ? 'Refreshing…' : state.updatedAt ? `Updated ${timeOf(state.updatedAt)}` : '',
    state.pending > 0 ? `${state.pending} ${state.pending === 1 ? 'entry' : 'entries'} waiting to send` : '',
  ].filter(Boolean)
  return (
    <div role="status" className="mt-2 text-xs">
      {parts.length > 0 && <p className="text-slate-600">{parts.join(' · ')}</p>}
      {state.error && <p className="text-red-800">{state.error}</p>}
    </div>
  )
}

function PaydayRow({ sheetId, workbook, payday, today }: { sheetId: string; workbook: Workbook; payday: Payday; today: IsoDate }) {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(toPesos(payday.amount).toFixed(2))
  const [error, setError] = useState<string | null>(null)
  const { source, date } = payday
  const to = source.toAccount
  const late = date < today

  const save = (cents: number, note = '') =>
    addIncome(sheetId, { date, sourceId: source.sourceId, type: incomeTypeFor(source), amount: cents, toAccount: to, note })

  function saveEdited() {
    const cents = parsePositiveAmount(amount)
    if (cents === null) return setError('Enter an amount more than 0.')
    save(cents)
  }

  return (
    <li className="py-2">
      <p className="text-sm text-slate-800">
        {late ? '▲ Not recorded yet: ' : '💰 Payday: '}
        <b>
          {source.label} {formatPeso(payday.amount)}
        </b>{' '}
        → {accountLabel(workbook, to)} <span className="text-slate-500">({shortDate(date)})</span>
      </p>
      {editing ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="w-36">
            <TextInput aria-label={`${source.label} amount received (₱)`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <Button className="px-3 py-1.5" onClick={saveEdited}>
            Save
          </Button>
          <Button variant="secondary" className="px-3 py-1.5" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          {error && <span className="text-sm text-red-800">{error}</span>}
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button className="px-3 py-1.5" onClick={() => save(payday.amount)}>
            Record
          </Button>
          <Button variant="secondary" className="px-3 py-1.5" onClick={() => setEditing(true)}>
            Different amount
          </Button>
          <Button variant="secondary" className="px-3 py-1.5" onClick={() => save(0, 'Skipped: did not arrive')}>
            Skip
          </Button>
        </div>
      )}
    </li>
  )
}

/** Paydays in the last two weeks that are not recorded yet: Record in one tap, a different amount, or Skip. */
export function PaydayReminders({ sheetId, workbook, today }: { sheetId: string; workbook: Workbook; today: IsoDate }) {
  const paydays = paydaysToRecord(workbook, today)
  if (paydays.length === 0) return null
  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-3" role="status">
      <ul className="divide-y divide-green-100">
        {paydays.map((p) => (
          <PaydayRow key={`${p.source.sourceId}-${p.date}`} sheetId={sheetId} workbook={workbook} payday={p} today={today} />
        ))}
      </ul>
    </div>
  )
}
