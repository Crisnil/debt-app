import { useState } from 'react'
import { Link } from 'react-router-dom'
import { addIncome } from '../../data/actions'
import { accountLabel, byGroup, TYPE_LABEL } from '../../domain/accounts'
import { accountsToCheck } from '../../domain/balances'
import { moneyParts, moneyTotals } from '../../domain/home'
import { incomeTypeFor, paydaysToRecord, type Payday } from '../../domain/payday'
import type { IsoDate, Workbook } from '../../domain/types'
import { formatPeso, toPesos } from '../../lib/money'
import { Button } from '../../ui/Button'
import { Donut } from '../../ui/charts/Donut'
import { accountColor } from '../../ui/charts/palette'
import { TextInput } from '../../ui/form'
import { parsePositiveAmount } from '../add/parseAmount'

const panel = 'rounded-xl bg-white p-4 shadow-sm'
const shortDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })

/** What we have: one part per money account, grouped Debit, E-wallet, Cash, with savings goal and spendable-now totals. */
export function WhatWeHave({ workbook, today }: { workbook: Workbook; today: IsoDate }) {
  const parts = moneyParts(workbook)
  if (parts.length === 0) return null
  const canCheck = !workbook.updates.some((u) => u.tab === 'BalanceChecks' && u.create)
  const unchecked = canCheck ? accountsToCheck(workbook, today.slice(0, 7)) : []
  const totals = moneyTotals(parts)
  // Ring order: by group (Debit, E-wallet, Cash), then by the account's row in the Accounts tab, not its size.
  // Colors follow the row, so a color never moves.
  const order = workbook.accounts.filter((a) => a.type !== 'credit_card').map((a) => a.accountId)
  const inSheetOrder = [...parts].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
  const donut = byGroup(inSheetOrder, (p) => p.type).map((p) => ({
    id: p.id,
    name: `${p.name}${p.isSavings ? ' · savings goal' : ''}${p.maintaining > 0 ? ` · 🔒 ${formatPeso(p.maintaining)} maintaining` : ''}`,
    amount: Math.max(p.amount, 0),
    color: accountColor(workbook, p.id),
    group: TYPE_LABEL[p.type],
  }))
  return (
    <div className={panel}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-medium text-slate-900">What we have</h2>
        <span className="space-x-3 text-sm">
          <Link to="/balances" className="text-green-900 underline">
            Check balances
          </Link>
          <Link to="/settings" className="text-green-900 underline">
            Accounts
          </Link>
        </span>
      </div>
      <Donut parts={donut} centerLabel="have">
        <p className="mb-2 border-b border-slate-100 pb-2 text-sm text-slate-600">
          Savings goal: <b className="text-slate-900">{formatPeso(totals.savings)}</b> · Spendable now: <b className="text-slate-900">{formatPeso(totals.spendable)}</b>
        </p>
      </Donut>
      {parts.some((p) => p.amount < 0) && <p className="mt-2 text-xs text-amber-900">! An account shows less than ₱0. Check its starting balance in Settings.</p>}
      {unchecked.length > 0 && (
        <p className="mt-2 text-sm text-slate-700">
          Not checked this month: {unchecked.map((a) => a.label).join(', ')} ·{' '}
          <Link to="/balances" className="text-green-900 underline">
            Check now
          </Link>
        </p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Balances count from each account&apos;s last balance check (or starting balance). Record paydays so they stay right.
      </p>
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
