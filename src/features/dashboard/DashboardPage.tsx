import { Link } from 'react-router-dom'
import { accountBalances, savedInMonth, savingsGoal } from '../../domain/balances'
import { daysBetween, summarizeDues, todayIso } from '../../domain/dues'
import { billsByMonth, forecastCards, withPayables, type CardForecast } from '../../domain/forecast'
import { addMonths, payableMonths, payablesOwed } from '../../domain/payables'
import type { IsoDate, Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { useLiveWorkbook, useSession } from '../../state/hooks'
import { Button } from '../../ui/Button'
import { monthLabel } from '../../ui/charts/palette'
import { ErrorNote } from '../../ui/ErrorNote'
import { useAction } from '../../ui/useAction'

/** Days ahead that "Due soon" looks at. */
const DUE_SOON_DAYS = 14

const panel = 'rounded-xl bg-white p-4 shadow-sm'

function TotalOwed({ forecasts, payables, leftNow, thisMonth }: { forecasts: CardForecast[]; payables: number; leftNow: number; thisMonth: { month: string; total: number } }) {
  const owed = forecasts.reduce((s, f) => s + f.owed, 0)
  const withLimit = forecasts.filter((f) => f.card.creditLimit)
  const limit = withLimit.reduce((s, f) => s + f.card.creditLimit!, 0)
  const usedOwed = withLimit.reduce((s, f) => s + f.owed, 0)
  return (
    <div className="rounded-xl bg-green-900 p-4 text-white">
      <p className="text-sm text-green-100">Total owed on cards</p>
      <p className="mt-1 text-5xl font-semibold tracking-tight">{formatPeso(owed)}</p>
      <p className="mt-1 text-xs text-green-100">
        Statement balance left + new charges + installments not billed yet{limit > 0 && ` · ${Math.round((usedOwed / limit) * 100)}% of your limits`}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-green-100">Left to pay on current statements</dt>
        <dd className="text-right font-medium">{formatPeso(leftNow)}</dd>
        {payables > 0 && (
          <>
            <dt className="text-green-100">Bills and money owed (outside cards)</dt>
            <dd className="text-right font-medium">{formatPeso(payables)}</dd>
          </>
        )}
        <dt className="text-green-100">All bills due in {monthLabel(thisMonth.month)}</dt>
        <dd className="text-right font-medium">{formatPeso(thisMonth.total)}</dd>
      </dl>
    </div>
  )
}

type DueItem = { key: string; name: string; detail: string; amount: number; dueDate: IsoDate; to: string }

function dueWhen(days: number, date: IsoDate) {
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} late (${date})`
  if (days === 0) return `Due today (${date})`
  if (days === 1) return `Due tomorrow (${date})`
  return `Due in ${days} days (${date})`
}

/** Everything due in the next two weeks (and anything late), soonest first. */
function DueSoon({ items, today }: { items: DueItem[]; today: IsoDate }) {
  return (
    <div className={panel}>
      <h2 className="font-medium text-slate-900">Due in the next {DUE_SOON_DAYS} days</h2>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-slate-600">Nothing due. ✓</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 text-sm">
          {items.map((item) => {
            const days = daysBetween(today, item.dueDate)
            return (
              <li key={item.key}>
                <Link to={item.to} className="flex items-baseline justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium text-slate-900">{item.name}</span>
                    <span className={`block text-xs ${days < 0 ? 'text-red-800' : 'text-slate-500'}`}>
                      {days < 0 ? '▲ ' : ''}
                      {dueWhen(days, item.dueDate)} · {item.detail}
                    </span>
                  </span>
                  <b className="text-slate-900">{formatPeso(item.amount)}</b>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function cardDueItems(workbook: Workbook, forecasts: CardForecast[], today: IsoDate): DueItem[] {
  const items: DueItem[] = []
  for (const f of forecasts) {
    for (const b of f.bills) {
      if (b.total <= 0 || daysBetween(today, b.bill.dueDate) > DUE_SOON_DAYS) continue
      items.push({
        key: `${f.card.cardId}-${b.bill.statementDate}`,
        name: f.card.name,
        detail: b.statementLeft ? 'left on the statement' : b.fromStatement ? 'statement lines in, total not final' : 'estimate',
        amount: b.total,
        dueDate: b.bill.dueDate,
        to: `/cards/${f.card.cardId}?tab=pay`,
      })
    }
  }
  // Late: the latest statement is past due and not fully paid.
  for (const c of summarizeDues(workbook, today).cards) {
    if (c.status === 'overdue' && c.snapshot) {
      items.push({ key: `${c.card.cardId}-late`, name: c.card.name, detail: 'left on the statement', amount: c.remainingDue, dueDate: c.snapshot.dueDate, to: `/cards/${c.card.cardId}?tab=pay` })
    }
  }
  return items
}

function payableDueItems(workbook: Workbook, today: IsoDate): DueItem[] {
  return payableMonths(workbook, addMonths(today.slice(0, 7), 1))
    .filter((m) => m.left > 0 && daysBetween(today, m.dueDate) <= DUE_SOON_DAYS)
    .map((m) => ({
      key: `${m.payable.payableId}-${m.month}`,
      name: m.payable.name,
      detail: m.paid > 0 ? `${formatPeso(m.paid)} paid` : m.payable.payee || m.payable.category,
      amount: m.left,
      dueDate: m.dueDate,
      to: '/bills',
    }))
}

function SavingsCard({ workbook, month }: { workbook: Workbook; month: string }) {
  const saved = savedInMonth(workbook, month)
  const goal = savingsGoal(workbook, month)
  const pct = goal > 0 ? Math.min(100, Math.max(0, Math.round((saved / goal) * 100))) : 0
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium text-slate-900">Savings this month</h2>
        <Link to="/add/other?type=save" className="text-sm text-green-900 underline">
          Add savings
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {formatPeso(saved)} of {formatPeso(goal)} goal
      </p>
      <div className="mt-2 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-2 rounded-full bg-green-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function AccountsCard({ workbook }: { workbook: Workbook }) {
  const balances = accountBalances(workbook)
  if (balances.length === 0) return null
  const total = balances.reduce((s, b) => s + b.balance, 0)
  return (
    <details className={panel}>
      <summary className="flex cursor-pointer items-baseline justify-between">
        <span className="font-medium text-slate-900">Money in accounts</span>
        <b className="text-slate-900">{formatPeso(total)}</b>
      </summary>
      <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
        {balances.map(({ account, balance }) => (
          <div key={account.accountId} className="contents">
            <dt className="text-slate-500">{account.label}</dt>
            <dd className="text-right text-slate-800">{formatPeso(balance)}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

export function DashboardPage() {
  const { sheet, signedIn, signIn } = useSession()
  const { workbook, query } = useLiveWorkbook()
  const signInAction = useAction(signIn)

  if (!sheet) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-2 text-slate-600">Connect your Google Sheet to start.</p>
        <Link to="/settings" className="mt-4 inline-block rounded-lg bg-green-900 px-4 py-2.5 text-sm font-medium text-white">
          Go to Settings
        </Link>
      </section>
    )
  }

  if (!signedIn) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-2 text-slate-600">Sign in to load {sheet.name}.</p>
        <Button className="mt-4" onClick={() => signInAction.run()} disabled={signInAction.busy}>
          Sign in with Google
        </Button>
        <ErrorNote message={signInAction.error} />
      </section>
    )
  }

  if (query.error) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <ErrorNote message={query.error.message} />
        <Link to="/settings" className="mt-3 inline-block text-sm text-green-900 underline">
          Check Settings
        </Link>
      </section>
    )
  }
  if (!workbook) return <p className="text-slate-600">Reading your sheet…</p>

  const today = todayIso()
  const dues = summarizeDues(workbook, today)
  const forecasts = forecastCards(workbook, today)
  const thisMonth = withPayables(billsByMonth(forecasts, today), workbook)[0]
  const due = [...cardDueItems(workbook, forecasts, today), ...payableDueItems(workbook, today)].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-4">
          <TotalOwed forecasts={forecasts} payables={payablesOwed(workbook, today)} leftNow={dues.totalRemainingDue} thisMonth={thisMonth} />
          <DueSoon items={due} today={today} />
        </div>
        <div className="space-y-4">
          <SavingsCard workbook={workbook} month={today.slice(0, 7)} />
          <AccountsCard workbook={workbook} />
          <p className="text-sm text-slate-600">
            Card details are on{' '}
            <Link to="/cards" className="text-green-900 underline">
              Cards
            </Link>
            . Bills and money you owe are on{' '}
            <Link to="/bills" className="text-green-900 underline">
              Bills
            </Link>
            . The next 12 months are on{' '}
            <Link to="/plan" className="text-green-900 underline">
              Plan
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  )
}
