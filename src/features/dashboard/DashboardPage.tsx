import { Link } from 'react-router-dom'
import { daysBetween, summarizeDues, todayIso } from '../../domain/dues'
import { forecastCards, type CardForecast } from '../../domain/forecast'
import { debtGauge, debtHealth, savingsGauge, savingsHealth, spendingGauge, spendingHealth, type Health } from '../../domain/health'
import { addMonths, payableMonths } from '../../domain/payables'
import type { IsoDate, Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { useLiveWorkbook, useSession } from '../../state/hooks'
import { Button } from '../../ui/Button'
import { Gauge } from '../../ui/charts/Gauge'
import { monthLabel } from '../../ui/charts/palette'
import { ErrorNote } from '../../ui/ErrorNote'
import { useAction } from '../../ui/useAction'

/** Days ahead that the "due soon" alert looks at. */
const DUE_SOON_DAYS = 7

const DEBT_WORD: Record<Health, string> = { good: 'Good', watch: 'Watch', careful: 'Careful', bad: 'Buried in debt' }
const SAVINGS_WORD: Record<Health, string> = { good: 'On target', watch: 'Halfway', careful: 'Behind', bad: 'Far behind' }
const SPENDING_WORD: Record<Health, string> = { good: 'On track', watch: 'Watch', careful: 'Over pace', bad: 'Overspending' }

type DueItem = { key: string; name: string; detail: string; amount: number; dueDate: IsoDate; to: string }

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

/** One line, only when something is late or due soon. Details are on Cards and Bills. */
function DueAlert({ items, today }: { items: DueItem[]; today: IsoDate }) {
  if (items.length === 0) return null
  const late = items.filter((i) => i.dueDate < today)
  const soon = items.filter((i) => i.dueDate >= today)
  const names = [...new Set(items.map((i) => i.name))].join(', ')
  const to = items.every((i) => i.to.startsWith('/cards')) ? '/cards' : items.every((i) => i.to === '/bills') ? '/bills' : '/cards'
  return (
    <Link to={to} className={`block rounded-xl p-3 text-sm ${late.length ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900'}`}>
      {late.length > 0 && <b>▲ {late.length} late</b>}
      {late.length > 0 && soon.length > 0 && ' · '}
      {soon.length > 0 && <b>{soon.length} due in {DUE_SOON_DAYS} days</b>}: {names} →
    </Link>
  )
}

/** "▲ vs Oct": higher or lower than last month. Amounts are on the other pages. */
const trendText = (now: number, before: number, month: string) => {
  if (before === 0 && now === 0) return undefined
  const arrow = now > before ? '▲ more' : now < before ? '▼ less' : '= same'
  return `${arrow} than ${monthLabel(month, false)}`
}

function HealthGauges({ workbook, forecasts, today }: { workbook: Workbook; forecasts: CardForecast[]; today: IsoDate }) {
  const debt = debtGauge(forecasts)
  const savings = savingsGauge(workbook, today)
  const spending = spendingGauge(workbook, today)
  const last = addMonths(today.slice(0, 7), -1)
  const debtH = debt.used === null ? null : debtHealth(debt.used)
  const savingsH = savings.ratio === null ? null : savingsHealth(savings.ratio)
  const spendingH = spending.ratio === null ? null : spendingHealth(spending.ratio)
  return (
    <div className="grid grid-cols-3 gap-2 lg:gap-4">
      <Gauge
        label="Debt used"
        ratio={debt.used}
        health={debtH}
        word={debtH ? DEBT_WORD[debtH] : 'Add limits'}
        detail={debt.used === null ? 'Set credit limits in Settings' : `of card limits`}
        to={debt.used === null ? '/settings' : '/cards'}
      />
      <Gauge
        label="Savings"
        ratio={savings.ratio}
        health={savingsH}
        word={savingsH ? SAVINGS_WORD[savingsH] : 'Set a goal'}
        detail={savings.ratio === null ? 'Set a goal in Settings' : 'of this month’s goal'}
        trend={trendText(savings.saved, savings.lastMonth, last)}
        to="/add/other?type=save"
      />
      <Gauge
        label="Spending"
        ratio={spending.ratio}
        health={spendingH}
        word={spendingH ? SPENDING_WORD[spendingH] : 'No budget'}
        detail={spending.ratio === null ? 'Set weekly budgets in Categories' : `of ${spending.basis === 'budget' ? 'budget' : 'income'} so far`}
        trend={trendText(spending.spent, spending.lastMonth, last)}
      />
    </div>
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
  const forecasts = forecastCards(workbook, today)
  const due = [...cardDueItems(workbook, forecasts, today), ...payableDueItems(workbook, today)].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
      <p className="text-sm text-slate-600">How are we doing in {monthLabel(today.slice(0, 7))}?</p>
      <HealthGauges workbook={workbook} forecasts={forecasts} today={today} />
      <div className="grid grid-cols-2 gap-3">
        <Link to="/add" className="rounded-xl bg-green-900 px-4 py-3 text-center font-medium text-white active:bg-green-800">
          + Add expense
        </Link>
        <Link to="/add/other?type=save" className="rounded-xl border border-green-900 bg-white px-4 py-3 text-center font-medium text-green-900 active:bg-green-50">
          + Add savings
        </Link>
      </div>
      <DueAlert items={due} today={today} />
    </section>
  )
}
