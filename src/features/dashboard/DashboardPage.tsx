import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { daysBetween, todayIso } from '../../domain/dues'
import { forecastCards } from '../../domain/forecast'
import { debtGauge, debtHealth, savingsGauge, savingsHealth, spendingGauge, spendingHealth, type Health } from '../../domain/health'
import { carriedAlerts, dueItems, nextDrop, owedParts, savingsParts, thisMonth } from '../../domain/home'
import { monthsUntil, payoffPaths } from '../../domain/payoff'
import type { IsoDate, Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { useLiveWorkbook, useRefresh, useSession, type RefreshState } from '../../state/hooks'
import { Button } from '../../ui/Button'
import { DebtSavingsBar } from '../../ui/charts/DebtSavingsBar'
import { Donut } from '../../ui/charts/Donut'
import { cardColor, monthLabel, STATUS } from '../../ui/charts/palette'
import { ErrorNote } from '../../ui/ErrorNote'
import { useAction } from '../../ui/useAction'
import { PaydayReminders, WhatWeHave } from './MoneyCards'

/** Days ahead that alerts and "Next due" look at. */
const DUE_SOON_DAYS = 7

const panel = 'rounded-xl bg-white p-4 shadow-sm'

const DEBT_WORD: Record<Health, string> = { good: 'Good', watch: 'Watch', careful: 'Careful', bad: 'Buried in debt' }
const SAVINGS_WORD: Record<Health, string> = { good: 'On target', watch: 'Halfway', careful: 'Behind', bad: 'Far behind' }
const SPENDING_WORD: Record<Health, string> = { good: 'On track', watch: 'Watch', careful: 'Over pace', bad: 'Overspending' }

/** Status word with its icon on the status color. Text is dark so it stays readable on every status color. */
function Badge({ health, word }: { health: Health; word: string }) {
  const s = STATUS[health]
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-slate-900" style={{ background: s.track, boxShadow: `inset 0 0 0 1px ${s.fill}` }}>
      {s.icon} {word}
    </span>
  )
}

function SectionHead({ title, to, link }: { title: string; to?: string; link?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="font-medium text-slate-900">{title}</h2>
      {to && (
        <Link to={to} className="text-sm text-green-900 underline">
          {link}
        </Link>
      )}
    </div>
  )
}

function Progress({ workbook, owed, today, debtFree }: { workbook: Workbook; owed: ReturnType<typeof owedParts>; today: IsoDate; debtFree: string | null }) {
  const [open, setOpen] = useState(false)
  const savings = savingsParts(workbook)
  const owedTotal = owed.reduce((s, p) => s + p.amount, 0)
  const savedTotal = savings.reduce((s, p) => s + p.amount, 0)
  const cover = owedTotal > 0 ? Math.round((savedTotal / owedTotal) * 100) : 100
  return (
    <div className={panel}>
      <SectionHead title="Debt vs savings" to="/settings" link="Edit" />
      <DebtSavingsBar owed={owedTotal} saved={savedTotal} />
      <p className="mt-2 flex flex-wrap justify-between gap-x-4 text-xs text-slate-600">
        <span>{savedTotal >= owedTotal && owedTotal > 0 ? '✓ Savings are more than what we owe' : `Savings cover ${cover}% of what we owe`}</span>
        <Link to="/plan" className="text-green-900 underline">
          {debtFree ? `Debt-free ${monthLabel(debtFree)} (${monthsUntil(today, debtFree)} months)` : 'Not debt-free within 5 years at this pace'}
        </Link>
      </p>
      <button type="button" className="mt-2 text-sm text-green-900" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '▾ Hide details' : '▸ Show details'}
      </button>
      {open && (
        <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {owed.map((p) => (
            <div key={p.id} className="contents">
              <dt className="text-slate-500">Owed · {p.name}</dt>
              <dd className="text-right text-slate-800">{formatPeso(p.amount)}</dd>
            </div>
          ))}
          {savings.map((p) => (
            <div key={p.id} className="contents">
              <dt className="text-slate-500">Savings · {p.name}</dt>
              <dd className="text-right text-slate-800">{formatPeso(p.amount)}</dd>
            </div>
          ))}
          {savings.length === 0 && <dt className="col-span-2 text-slate-500">No savings goal account yet. In Settings → Accounts, edit one and tick “Savings goal money”.</dt>}
        </dl>
      )}
      <p className="sr-only">As of {today}</p>
    </div>
  )
}

function Alerts({ workbook, forecasts, today }: { workbook: Workbook; forecasts: ReturnType<typeof forecastCards>; today: IsoDate }) {
  const due = dueItems(workbook, forecasts, today, DUE_SOON_DAYS)
  const late = due.filter((d) => d.dueDate < today)
  const soon = due.filter((d) => d.dueDate >= today)
  const carried = carriedAlerts(forecasts)
  if (late.length === 0 && soon.length === 0 && carried.length === 0) return null
  return (
    <div className={`space-y-1 rounded-xl border p-3 text-sm ${late.length ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`} role="status">
      {late.length > 0 && (
        <p>
          ▲ <b>{late.length} late:</b> {late.map((d) => d.name).join(', ')}
        </p>
      )}
      {soon.length > 0 && (
        <p>
          ! <b>Due in {DUE_SOON_DAYS} days:</b> {soon.map((d) => `${d.name} (${d.dueDate.slice(5)})`).join(', ')}
        </p>
      )}
      {carried.map((c) => (
        <p key={c.cardId}>
          ! <b>{c.name}:</b> {formatPeso(c.carried)} carried, about {formatPeso(c.interest)} interest on the {c.statementDate} bill.
        </p>
      ))}
    </div>
  )
}

function WhatWeOwe({ workbook, forecasts, owed }: { workbook: Workbook; forecasts: ReturnType<typeof forecastCards>; owed: ReturnType<typeof owedParts> }) {
  // Same colors as the Plan chart: each card by its row in the Cards tab, payables in their own color.
  const parts = owed.map((p) => ({ ...p, color: cardColor(workbook, p.id) }))
  const total = owed.reduce((s, p) => s + p.amount, 0)
  const debt = debtGauge(forecasts)
  const health = debt.used === null ? null : debtHealth(debt.used)
  const biggest = owed.reduce<(typeof owed)[number] | null>((b, p) => (b === null || p.amount > b.amount ? p : b), null)
  if (total === 0) return null
  return (
    <div className={panel}>
      <SectionHead title="What we owe" to="/cards" link="Cards" />
      <Donut parts={parts} centerLabel="owed">
        <p className="mb-2 border-b border-slate-100 pb-2 text-sm text-slate-600">
          Debt status:{' '}
          {health ? (
            <>
              <Badge health={health} word={DEBT_WORD[health]} /> {Math.round(debt.used! * 100)}% of credit limits
            </>
          ) : (
            <Link to="/settings" className="text-green-900 underline">
              add credit limits
            </Link>
          )}
        </p>
      </Donut>
      {biggest && (
        <p className="mt-3 text-xs text-slate-500">
          *{biggest.name} is {Math.round((biggest.amount / total) * 100)}% of what we owe. Includes installments not billed yet. {workbook.payables.length === 0 && 'Add bills on the Bills page.'}
        </p>
      )}
    </div>
  )
}

function Tile({ label, children, to }: { label: string; children: ReactNode; to?: string }) {
  const body = (
    <>
      <p className="text-xs text-slate-500">{label}</p>
      {children}
    </>
  )
  return to ? (
    <Link to={to} className={`${panel} block active:bg-slate-50`}>
      {body}
    </Link>
  ) : (
    <div className={panel}>{body}</div>
  )
}

function Tiles({ workbook, forecasts, today }: { workbook: Workbook; forecasts: ReturnType<typeof forecastCards>; today: IsoDate }) {
  const next = dueItems(workbook, forecasts, today, 62).find((d) => d.dueDate >= today) ?? null
  const month = thisMonth(workbook, forecasts, today)
  const over = month.income > 0 ? Math.round(((month.bills - month.income) / month.income) * 100) : null
  const drop = nextDrop(forecasts, today)
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Tile label="Next due" to={next?.to}>
        {next ? (
          <>
            <p className="mt-1 text-lg font-semibold text-slate-900">{next.name}</p>
            <p className="text-sm text-slate-600">
              {next.dueDate} · {formatPeso(next.amount)}
            </p>
            <p className="text-xs text-slate-500">in {daysBetween(today, next.dueDate)} days</p>
          </>
        ) : (
          <p className="mt-1 text-lg font-semibold text-slate-900">Nothing due ✓</p>
        )}
      </Tile>
      <Tile label={`Bills due in ${monthLabel(month.month)}`} to="/plan">
        <p className="mt-1 text-lg font-semibold text-slate-900">{formatPeso(month.bills)}</p>
        {over !== null && <Badge health={over > 0 ? 'bad' : over > -10 ? 'watch' : 'good'} word={over > 0 ? `${over}% over income` : `${-over}% under income`} />}
        <p className="mt-0.5 text-xs text-slate-500">Income {formatPeso(month.income)}</p>
      </Tile>
      <Tile label="Next drop in bills" to="/plan">
        {drop ? (
          <>
            <p className="mt-1 text-lg font-semibold text-slate-900">{monthLabel(drop.lastDue)}</p>
            <p className="text-sm text-slate-600">−{formatPeso(drop.monthly)}/mo after</p>
            <p className="truncate text-xs text-slate-500">{drop.plans.map((p) => p.description).join(', ')}</p>
          </>
        ) : (
          <p className="mt-1 text-lg font-semibold text-slate-900">No installments</p>
        )}
      </Tile>
    </div>
  )
}

function Metric({ label, value, to, children }: { label: string; value: string; to?: string; children?: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      {to ? (
        <Link to={to} className="mt-1 block text-lg font-semibold text-green-900 underline decoration-green-900/30 underline-offset-4">
          {value}
        </Link>
      ) : (
        <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
      )}
      {children}
    </div>
  )
}

function ThisMonthRow({ workbook, forecasts, today }: { workbook: Workbook; forecasts: ReturnType<typeof forecastCards>; today: IsoDate }) {
  const month = thisMonth(workbook, forecasts, today)
  const spending = spendingGauge(workbook, today)
  const savings = savingsGauge(workbook, today)
  const spendingH = spending.ratio === null ? null : spendingHealth(spending.ratio)
  const savingsH = savings.ratio === null ? null : savingsHealth(savings.ratio)
  return (
    <div className={panel}>
      <SectionHead title={`This month · ${monthLabel(month.month)}`} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Income (plan)" value={formatPeso(month.income)} />
        <Metric label="Spent so far" value={formatPeso(spending.spent)} to="/transactions">
          {spendingH && <Badge health={spendingH} word={SPENDING_WORD[spendingH]} />}
          {spending.ratio !== null && (
            <p className="mt-0.5 text-xs text-slate-500">
              {Math.round(spending.ratio * 100)}% of {spending.basis === 'plan' ? 'plan' : spending.basis === 'budget' ? 'budget' : 'income'} so far
            </p>
          )}
        </Metric>
        <Metric label="Saved" value={formatPeso(savings.saved)}>
          {savingsH && <Badge health={savingsH} word={SAVINGS_WORD[savingsH]} />}
          {savings.goal > 0 && <p className="mt-0.5 text-xs text-slate-500">of {formatPeso(savings.goal)} goal</p>}
        </Metric>
        <Metric label="Interest (est.)" value={formatPeso(month.interest)}>
          <p className="text-xs text-slate-500">{month.interest > 0 ? 'on bills due this month' : 'none this month ✓'}</p>
        </Metric>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { sheet, signedIn, signIn } = useSession()
  const { workbook, query } = useLiveWorkbook()
  const refresh = useRefresh()
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

  return <HomeView sheetId={sheet.id} workbook={workbook} today={todayIso()} refresh={refresh} />
}

/** The Home page body for a loaded workbook. */
export function HomeView({ sheetId, workbook, today, refresh }: { sheetId: string; workbook: Workbook; today: IsoDate; refresh?: RefreshState }) {
  const forecasts = forecastCards(workbook, today)
  const owed = owedParts(workbook, forecasts, today)
  const name = workbook.settings.display_name?.value
  return (
    <section className="mx-auto max-w-4xl space-y-4">
      <h1 className="sr-only">Dashboard</h1>
      <p className="text-2xl font-semibold text-slate-900">👋 Welcome{name ? ` ${name}` : ' back'}!</p>
      <PaydayReminders sheetId={sheetId} workbook={workbook} today={today} />
      <Progress workbook={workbook} owed={owed} today={today} debtFree={payoffPaths(workbook, today).main.debtFree} />
      <Alerts workbook={workbook} forecasts={forecasts} today={today} />
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
        <WhatWeOwe workbook={workbook} forecasts={forecasts} owed={owed} />
        <WhatWeHave workbook={workbook} today={today} refresh={refresh} />
      </div>
      <Tiles workbook={workbook} forecasts={forecasts} today={today} />
      <ThisMonthRow workbook={workbook} forecasts={forecasts} today={today} />
    </section>
  )
}
