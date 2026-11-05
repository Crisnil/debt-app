import { useState } from 'react'
import { Link } from 'react-router-dom'
import { addIncome } from '../../data/actions'
import { accountLabel } from '../../domain/accounts'
import { moneyParts, moneyTotals } from '../../domain/home'
import { incomeTypeFor, paydaysToRecord, type Payday } from '../../domain/payday'
import type { IsoDate, Workbook } from '../../domain/types'
import { formatPeso, toPesos } from '../../lib/money'
import { Button } from '../../ui/Button'
import { Donut } from '../../ui/charts/Donut'
import { seriesColor } from '../../ui/charts/palette'
import { TextInput } from '../../ui/form'
import { parsePositiveAmount } from '../add/parseAmount'

const panel = 'rounded-xl bg-white p-4 shadow-sm'
const shortDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })

/** What we have: one part per money account (banks, cash, e-wallets), with savings and spendable-now totals. */
export function WhatWeHave({ workbook }: { workbook: Workbook }) {
  const parts = moneyParts(workbook)
  if (parts.length === 0) return null
  const totals = moneyTotals(parts)
  // Colors follow the account order in the Accounts tab, not the size order.
  const order = workbook.accounts.filter((a) => a.type !== 'credit_card' && a.active).map((a) => a.accountId)
  const donut = parts.map((p) => ({
    id: p.id,
    name: `${p.name}${p.isSavings ? ' · savings' : ''}${p.maintaining > 0 ? ` · 🔒 ${formatPeso(p.maintaining)} maintaining` : ''}`,
    amount: Math.max(p.amount, 0),
    color: seriesColor(order.indexOf(p.id)),
  }))
  return (
    <div className={panel}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-medium text-slate-900">What we have</h2>
        <Link to="/settings" className="text-sm text-green-900 underline">
          Accounts
        </Link>
      </div>
      <Donut parts={donut} centerLabel="have">
        <p className="mb-2 border-b border-slate-100 pb-2 text-sm text-slate-600">
          Savings: <b className="text-slate-900">{formatPeso(totals.savings)}</b> · Spendable now: <b className="text-slate-900">{formatPeso(totals.spendable)}</b>
        </p>
      </Donut>
      {parts.some((p) => p.amount < 0) && <p className="mt-2 text-xs text-amber-900">! An account shows less than ₱0. Check its starting balance in Settings.</p>}
      <p className="mt-2 text-xs text-slate-500">Balances count from each account&apos;s starting balance. Record paydays so they stay right.</p>
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
