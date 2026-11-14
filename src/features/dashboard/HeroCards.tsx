import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { byGroup, TYPE_LABEL } from '../../domain/accounts'
import { accountsToCheck } from '../../domain/balances'
import type { CardForecast } from '../../domain/forecast'
import { moneyParts, moneyTotals, type MoneyPart } from '../../domain/home'
import type { IsoDate, Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import type { RefreshState } from '../../state/hooks'
import { Swipe, swipeCard as card } from '../../ui/Swipe'

const shortDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
const timeOf = (date: Date) => date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })

// Makes the whole card open its link; buttons inside the card sit above it (relative z-10).
const stretched = 'after:absolute after:inset-0 after:rounded-2xl after:content-[""]'

/** The newest balance check of an account, or null. */
function lastCheck(workbook: Workbook, accountId: string): IsoDate | null {
  return workbook.balanceChecks.filter((c) => c.accountId === accountId).reduce<IsoDate | null>((max, c) => (max === null || c.date > max ? c.date : max), null)
}

/** Card 1: what we have in total, savings goal money and spendable now. */
function SummaryCard({ parts, refresh }: { parts: MoneyPart[]; refresh?: RefreshState }) {
  const totals = moneyTotals(parts)
  return (
    <li className={`${card} bg-green-900 text-white`}>
      <p className="flex items-center justify-between text-sm text-green-100">
        <span>Spendable now</span>
        {refresh && <RefreshButton state={refresh} />}
      </p>
      <p className="mt-1 text-2xl font-semibold">{formatPeso(totals.spendable)}</p>
      <p className="mt-auto pt-3 text-xs text-green-100">
        Savings goal {formatPeso(totals.savings)} · Total {formatPeso(totals.total)}
      </p>
    </li>
  )
}

/** A debit, e-wallet or cash account. Tap: its transactions. Update balance: check its real balance. */
function AccountCard({ workbook, part }: { workbook: Workbook; part: MoneyPart }) {
  const checked = lastCheck(workbook, part.id)
  return (
    <li className={`${card} bg-white ring-1 ring-slate-200`}>
      <Link to={`/transactions?account=${part.id}`} className={`${stretched} text-sm text-slate-600`}>
        <span className="font-medium text-slate-900">{part.name}</span> · {TYPE_LABEL[part.type]}
        {part.isSavings && <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-900">savings goal</span>}
      </Link>
      <p className={`mt-1 text-2xl font-semibold ${part.amount < 0 ? 'text-red-800' : 'text-slate-900'}`}>{formatPeso(part.amount)}</p>
      {part.maintaining > 0 && <p className="text-xs text-slate-500">🔒 {formatPeso(part.maintaining)} maintaining</p>}
      <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs text-slate-500">
        <span>{checked ? `Checked ${shortDate(checked)}` : 'Not checked yet'}</span>
        <Link
          to={`/balances?account=${part.id}`}
          aria-label={`Update balance of ${part.name}`}
          className="relative z-10 rounded-full border border-green-900 px-3 py-1 font-medium text-green-900 active:bg-green-50"
        >
          Update balance
        </Link>
      </div>
    </li>
  )
}

/** What a credit card shows: owed, share of the limit, and the next bill. `name` is the card's link or button. */
export function CreditCardFace({ forecast, today, name }: { forecast: CardForecast; today: IsoDate; name: ReactNode }) {
  const { card: c, owed, used } = forecast
  const next = forecast.bills.find((b) => b.total > 0)
  return (
    <>
      {name}
      <p className="mt-1 text-2xl font-semibold">{formatPeso(owed)}</p>
      <p className="text-xs text-slate-300">
        {used === null || c.creditLimit === null ? 'owed' : `owed · ${Math.round(used * 100)}% of ${formatPeso(c.creditLimit)} limit`}
      </p>
      <p className="mt-auto pt-3 text-xs text-slate-300">
        {next ? `${next.bill.dueDate < today ? '▲ Was due' : 'Due'} ${shortDate(next.bill.dueDate)} · ${formatPeso(next.total)}` : 'Nothing due ✓'}
      </p>
    </>
  )
}

export const creditCardStyle = `${card} bg-slate-800 text-white`

/** A credit card on Home. Tap: the card's page. */
function CreditCard({ forecast, today }: { forecast: CardForecast; today: IsoDate }) {
  const c = forecast.card
  return (
    <li className={creditCardStyle}>
      <CreditCardFace
        forecast={forecast}
        today={today}
        name={
          <Link to={`/cards/${c.cardId}`} className={`${stretched} text-sm text-slate-300`}>
            <span className="font-medium text-white">{c.name}</span> · Credit
          </Link>
        }
      />
    </li>
  )
}

/**
 * Home hero: a summary card, then each money account (Debit, E-wallet, Cash in sheet order), then each credit card.
 * Phone: swipe through them. Wide screens: a grid.
 */
export function HeroCards({ workbook, forecasts, today, refresh }: { workbook: Workbook; forecasts: CardForecast[]; today: IsoDate; refresh?: RefreshState }) {
  const order = workbook.accounts.map((a) => a.accountId)
  const parts = byGroup(
    moneyParts(workbook).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
    (p) => p.type,
  )
  const cards = forecasts.filter((f) => f.card.active)
  const count = 1 + parts.length + cards.length
  const canCheck = !workbook.updates.some((u) => u.tab === 'BalanceChecks' && u.create)
  const unchecked = canCheck ? accountsToCheck(workbook, today.slice(0, 7)) : []

  return (
    <div>
      <Swipe label="Accounts and cards" count={count}>
        <SummaryCard parts={parts} refresh={refresh} />
        {parts.map((p) => (
          <AccountCard key={p.id} workbook={workbook} part={p} />
        ))}
        {cards.map((f) => (
          <CreditCard key={f.card.cardId} forecast={f} today={today} />
        ))}
      </Swipe>
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
    </div>
  )
}

/** ↻: sends waiting entries and reloads the sheet. Spins while it works. */
function RefreshButton({ state }: { state: RefreshState }) {
  return (
    <button
      type="button"
      aria-label="Refresh balances"
      title="Refresh balances"
      disabled={state.busy}
      onClick={state.refresh}
      className="-m-1 rounded-full p-1 text-white hover:bg-white/10 disabled:opacity-60"
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
