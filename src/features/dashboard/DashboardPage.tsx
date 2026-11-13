import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { daysBetween, todayIso } from '../../domain/dues'
import { entries, KIND_LABEL } from '../../domain/activity'
import { accountLabel } from '../../domain/accounts'
import { forecastCards } from '../../domain/forecast'
import { debtGauge, debtHealth, type Health } from '../../domain/health'
import { carriedAlerts, dueItems, monthlyFlow, nextDrop, owedParts, savingsParts, thisMonth } from '../../domain/home'
import { monthsUntil, payoffPaths } from '../../domain/payoff'
import type { IsoDate, Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { useLiveWorkbook, useRefresh, useSession, type RefreshState } from '../../state/hooks'
import { Button } from '../../ui/Button'
import { DebtSavingsBar } from '../../ui/charts/DebtSavingsBar'
import { SpentSavedChart } from '../../ui/charts/SpentSavedChart'
import { Donut } from '../../ui/charts/Donut'
import { cardColor, monthLabel, STATUS } from '../../ui/charts/palette'
import { ErrorNote } from '../../ui/ErrorNote'
import { useAction } from '../../ui/useAction'
import { HeroCards } from './HeroCards'
import { PaydayReminders } from './MoneyCards'
import { SetupChecklist } from './SetupChecklist'

/** Days ahead the bell looks at, besides late bills. Wider than the app icon badge (BADGE_DAYS). */
const BELL_DAYS = 7
/** Entries shown under Recent transactions. */
const RECENT_SHOWN = 5

const panel = 'rounded-xl bg-white p-4 shadow-sm'

const DEBT_WORD: Record<Health, string> = { good: 'Good', watch: 'Watch', careful: 'Careful', bad: 'Buried in debt' }

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

/** 🔔 with the number of alerts: bills late or due in the next BELL_DAYS days, and card balances carried to the next bill. */
function Bell({ workbook, forecasts, today }: { workbook: Workbook; forecasts: ReturnType<typeof forecastCards>; today: IsoDate }) {
  const [open, setOpen] = useState(false)
  const due = dueItems(workbook, forecasts, today, BELL_DAYS)
  const carried = carriedAlerts(forecasts)
  const count = due.length + carried.length
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={count > 0 ? `Alerts (${count})` : 'Alerts'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="relative rounded-full p-2 text-slate-700 hover:bg-slate-100"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-red-700 px-1 text-center text-xs leading-5 font-semibold text-white" aria-hidden="true">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Alerts" className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-3 text-sm shadow-lg ring-1 ring-slate-200">
          {count === 0 && <p className="text-slate-600">No alerts ✓</p>}
          <ul className="divide-y divide-slate-100">
            {due.map((d) => (
              <li key={d.key} className="flex items-center justify-between gap-3 py-2">
                <span className={d.dueDate < today ? 'text-red-800' : 'text-amber-900'}>
                  {d.dueDate < today ? '▲ ' : '! '}
                  <b>{d.name}</b> {formatPeso(d.amount)} · {dueIn(today, d.dueDate)}
                </span>
                <Link to={d.to} aria-label={`Pay ${d.name}`} className="shrink-0 text-green-900 underline">
                  Pay
                </Link>
              </li>
            ))}
            {carried.map((c) => (
              <li key={c.cardId} className="py-2 text-amber-900">
                ! <b>{c.name}:</b> {formatPeso(c.carried)} carried, about {formatPeso(c.interest)} interest on the {c.statementDate} bill.
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Days left, or days late, in words. */
function dueIn(today: IsoDate, dueDate: IsoDate): string {
  const days = daysBetween(today, dueDate)
  if (days === 0) return 'due today'
  if (days === 1) return 'due tomorrow'
  if (days === -1) return '1 day late'
  return days > 0 ? `in ${days} days` : `${-days} days late`
}

/** What we owe by card and bill, with the debt status (share of credit limits used). On the Plan page. */
export function WhatWeOwe({ workbook, forecasts, owed }: { workbook: Workbook; forecasts: ReturnType<typeof forecastCards>; owed: ReturnType<typeof owedParts> }) {
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

/** Bills due this month against income, and when bills go down. On the Plan page. */
export function Tiles({ workbook, forecasts, today }: { workbook: Workbook; forecasts: ReturnType<typeof forecastCards>; today: IsoDate }) {
  const month = thisMonth(workbook, forecasts, today)
  const over = month.income > 0 ? Math.round(((month.bills - month.income) / month.income) * 100) : null
  const drop = nextDrop(forecasts, today)
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Tile label={`Bills due in ${monthLabel(month.month)}`}>
        <p className="mt-1 text-lg font-semibold text-slate-900">{formatPeso(month.bills)}</p>
        {over !== null && <Badge health={over > 0 ? 'bad' : over > -10 ? 'watch' : 'good'} word={over > 0 ? `${over}% over income` : `${-over}% under income`} />}
        <p className="mt-0.5 text-xs text-slate-500">Income {formatPeso(month.income)}</p>
      </Tile>
      <Tile label="When bills go down">
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

/** Spent and moved to savings, per month for the last 6 months. */
function SpentSaved({ workbook, today }: { workbook: Workbook; today: IsoDate }) {
  return (
    <div className={panel}>
      <SectionHead title="Spent vs saved" to="/transactions" link="Transactions" />
      <SpentSavedChart months={monthlyFlow(workbook, today)} />
    </div>
  )
}

const shortDay = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })

/** The newest entries of every kind: purchases, money in, moves, and card payments. */
function RecentTransactions({ workbook }: { workbook: Workbook }) {
  const recent = entries(workbook).slice(0, RECENT_SHOWN)
  return (
    <div className={panel}>
      <SectionHead title="Recent transactions" to="/transactions" link="View all" />
      {recent.length === 0 && <p className="text-sm text-slate-600">Nothing yet. Add one with the + button.</p>}
      <ul className="divide-y divide-slate-100 text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {recent.map((e) => {
          const where = e.kind === 'in' ? `to ${accountLabel(workbook, e.to)}` : e.kind === 'move' ? '' : `from ${accountLabel(workbook, e.from)}`
          const moneyIn = e.kind === 'in' || (e.kind === 'purchase' && e.amount < 0)
          return (
            <li key={e.key} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-900">{e.label || '(no description)'}</span>
                <span className="block text-xs text-slate-500">{[shortDay(e.date), KIND_LABEL[e.kind], where].filter(Boolean).join(' · ')}</span>
              </span>
              <span className={`shrink-0 ${moneyIn ? 'text-green-900' : e.kind === 'purchase' ? 'text-slate-800' : 'text-slate-500'}`}>
                {e.kind === 'in' ? '+' : e.kind === 'purchase' && e.amount > 0 ? '−' : ''}
                {formatPeso(Math.abs(e.amount))}
              </span>
            </li>
          )
        })}
      </ul>
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
        <p className="mt-2 text-slate-600">Create your sheet in one tap, or connect the one you have, in Settings.</p>
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
    <section className="mx-auto max-w-5xl space-y-4">
      <h1 className="sr-only">Dashboard</h1>
      <header className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-2xl font-semibold text-slate-900">👋 Welcome{name ? ` ${name}` : ' back'}!</p>
        <div className="flex shrink-0 items-center">
          <Bell workbook={workbook} forecasts={forecasts} today={today} />
          {/* Wide screens have Settings in the sidebar. */}
          <Link to="/settings" aria-label="Settings" className="rounded-full p-2 text-slate-700 hover:bg-slate-100 lg:hidden">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
        </div>
      </header>
      <HeroCards workbook={workbook} forecasts={forecasts} today={today} refresh={refresh} />
      <Progress workbook={workbook} owed={owed} today={today} debtFree={payoffPaths(workbook, today).main.debtFree} />
      <SetupChecklist workbook={workbook} />
      <PaydayReminders sheetId={sheetId} workbook={workbook} today={today} />
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
        <SpentSaved workbook={workbook} today={today} />
        <RecentTransactions workbook={workbook} />
      </div>
    </section>
  )
}
