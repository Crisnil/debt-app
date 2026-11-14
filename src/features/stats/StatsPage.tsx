import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { summarizeDues, todayIso } from '../../domain/dues'
import { forecastCards } from '../../domain/forecast'
import { reconcileCard, spendingItems } from '../../domain/reconcile'
import { categoryShares, HIGHLIGHT_MONTHS, periodLabel, periodRange, shiftPeriod, spendingHighlights, type Period } from '../../domain/stats'
import type { IsoDate, Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { CreditUsedBar } from '../../ui/charts/CreditUsed'
import { Donut } from '../../ui/charts/Donut'
import { monthLabel, shortPeso, slotColor } from '../../ui/charts/palette'
import { Swipe } from '../../ui/Swipe'
import { CardRow } from '../cards/CardSummary'
import { creditCardStyle, CreditCardFace } from '../dashboard/HeroCards'
import { PlanView } from '../plan/PlanPage'
import { WithWorkbook } from '../WithWorkbook'

const panel = 'rounded-xl bg-white p-4 shadow-sm'

const TABS = [
  { id: 'spending', label: 'Spending' },
  { id: 'cards', label: 'Cards' },
  { id: 'plan', label: 'Plan' },
] as const
type Tab = (typeof TABS)[number]['id']

const PERIODS: { id: Period; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
]

const longDay = (date: IsoDate) => new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

/** Underlined tabs: the chosen one is green. */
function Tabs<T extends string>({ label, tabs, value, onChange, className = '' }: { label: string; tabs: readonly { id: T; label: string }[]; value: T; onChange: (id: T) => void; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={`flex border-b border-slate-200 ${className}`}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
          className={`-mb-px flex-1 border-b-2 py-2 text-sm ${t.id === value ? 'border-green-900 font-medium text-green-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

/** A highlight tile. tone: dark (green-900), light (green tints), or plain white. */
function Highlight({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: 'dark' | 'light' | 'lighter' | 'plain' }) {
  const style = { dark: 'bg-green-900 text-white', light: 'bg-green-100 text-slate-900', lighter: 'bg-green-50 text-slate-900', plain: 'bg-white text-slate-900' }[tone]
  const sub = tone === 'dark' ? 'text-green-100' : 'text-slate-600'
  return (
    <div className={`rounded-xl p-3 shadow-sm ${style}`}>
      <p className={`text-xs ${sub}`}>{label}</p>
      <p className="mt-1 truncate text-lg font-semibold">{value}</p>
      <p className={`text-xs ${sub}`}>{detail}</p>
    </div>
  )
}

function SpendingTab({ workbook, today }: { workbook: Workbook; today: IsoDate }) {
  const items = spendingItems(workbook)
  const h = spendingHighlights(items, today)
  const [period, setPeriod] = useState<Period>('month')
  const [date, setDate] = useState(today)
  const shares = categoryShares(items, period, date)
  const isCurrent = periodRange(period, date).end >= today
  const parts = shares.map((r, i) => ({ id: r.category, name: r.category, amount: r.spent, color: slotColor(i) }))
  const top = shares[0]
  return (
    <div className="space-y-4">
      <section aria-labelledby="highlights">
        <h2 id="highlights" className="mb-2 font-medium text-slate-900">
          Spending highlights
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Highlight tone="dark" label="Highest month" value={h.highestMonth ? monthLabel(h.highestMonth.month) : '—'} detail={h.highestMonth ? `${shortPeso(h.highestMonth.spent)} spent` : 'No spending yet'} />
          <Highlight tone="light" label="Most spent category" value={h.topCategory?.category ?? '—'} detail={h.topCategory ? `${shortPeso(h.topCategory.spent)} total` : 'No spending yet'} />
          <Highlight tone="lighter" label="Highest daily spending" value={h.highestDay ? longDay(h.highestDay.date) : '—'} detail={h.highestDay ? `${shortPeso(h.highestDay.spent)} spent` : 'No spending yet'} />
          <Highlight tone="plain" label="Average per day" value={formatPeso(h.perDay)} detail="This month so far" />
        </div>
        <p className="mt-2 text-xs text-slate-500">Highest month, category and day: the last {HIGHLIGHT_MONTHS} months.</p>
      </section>

      <section className={panel} aria-labelledby="by-category">
        <h2 id="by-category" className="font-medium text-slate-900">
          Spending by category
        </h2>
        <div className="mt-2 flex items-center justify-between gap-2">
          <Tabs label="Period" tabs={PERIODS} value={period} onChange={(p) => (setPeriod(p), setDate(today))} className="max-w-56 flex-1" />
          <div className="flex items-center gap-1 text-sm text-green-900">
            <button type="button" aria-label="Previous" className="rounded px-2 py-1 hover:bg-green-50" onClick={() => setDate(shiftPeriod(period, date, -1))}>
              ‹
            </button>
            <span className="min-w-20 text-center font-medium">{periodLabel(period, date)}</span>
            <button type="button" aria-label="Next" disabled={isCurrent} className="rounded px-2 py-1 hover:bg-green-50 disabled:opacity-30" onClick={() => setDate(shiftPeriod(period, date, 1))}>
              ›
            </button>
          </div>
        </div>
        <div className="mt-4">
          {top ? (
            <Donut parts={parts} centerLabel={`spent${isCurrent ? ' so far' : ''}`} showShare>
              <p className="mb-2 text-sm text-slate-600">
                Most: <b className="text-slate-900">{top.category}</b> {formatPeso(top.spent)} · {Math.round(top.share * 100)}% of {periodLabel(period, date)}
              </p>
            </Donut>
          ) : (
            <p className="text-sm text-slate-500">No spending in {periodLabel(period, date)}.</p>
          )}
        </div>
      </section>
    </div>
  )
}

/** Credit cards one at a time (swipe), with the chosen card's statement and next bill below. */
function CardsTab({ workbook, today }: { workbook: Workbook; today: IsoDate }) {
  const dues = summarizeDues(workbook, today)
  const forecasts = forecastCards(workbook, today)
  const [chosen, setChosen] = useState(0)
  if (dues.cards.length === 0) {
    return (
      <p className="text-slate-600">
        No credit cards yet. Add one in{' '}
        <Link to="/settings" className="text-green-900 underline">
          Settings
        </Link>
        .
      </p>
    )
  }
  const active = Math.min(chosen, dues.cards.length - 1)
  const c = dues.cards[active]
  const forecast = forecasts.find((f) => f.card.cardId === c.card.cardId)
  const r = reconcileCard(workbook, c.card.cardId)
  return (
    <div className="space-y-4">
      <Swipe label="Credit cards" count={dues.cards.length} active={active} onActive={setChosen}>
        {dues.cards.map((d, i) => {
          const f = forecasts.find((x) => x.card.cardId === d.card.cardId)
          return (
            <li key={d.card.cardId} className={`${creditCardStyle} ${i === active ? 'ring-2 ring-green-500' : ''}`}>
              {f && (
                <CreditCardFace
                  forecast={f}
                  today={today}
                  name={
                    <button type="button" aria-pressed={i === active} onClick={() => setChosen(i)} className='text-left text-sm text-slate-300 after:absolute after:inset-0 after:rounded-2xl after:content-[""]'>
                      <span className="font-medium text-white">{d.card.name}</span> · Credit
                    </button>
                  }
                />
              )}
            </li>
          )
        })}
      </Swipe>
      <ul className="max-w-xl">
        <CardRow c={c} next={forecast?.bills.find((b) => b.statementLeft === 0)} toCheck={r.probable.length + r.unlogged.length + r.notOnStatement.length}>
          {forecast && (
            <div className="mt-3">
              <CreditUsedBar forecast={forecast} showName={false} />
            </div>
          )}
        </CardRow>
      </ul>
    </div>
  )
}

/** Statistics: Spending, Cards, and Plan tabs. The tab is in the URL (?tab=), so links and Back keep it. */
export function StatsView({ sheetId, workbook, today }: { sheetId: string; workbook: Workbook; today: IsoDate }) {
  const [params, setParams] = useSearchParams()
  const given = params.get('tab')
  const tab: Tab = TABS.some((t) => t.id === given) ? (given as Tab) : 'spending'
  const body: Record<Tab, ReactNode> = {
    spending: <SpendingTab workbook={workbook} today={today} />,
    cards: <CardsTab workbook={workbook} today={today} />,
    plan: <PlanView sheetId={sheetId} workbook={workbook} today={today} />,
  }
  return (
    <section className="space-y-4">
      <h1 className="text-center text-2xl font-semibold text-slate-900 lg:text-left">Statistics</h1>
      <Tabs label="Statistics" tabs={TABS} value={tab} onChange={(t) => setParams(t === 'spending' ? {} : { tab: t }, { replace: true })} className="lg:max-w-md" />
      <div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)!.label}>
        {body[tab]}
      </div>
    </section>
  )
}

export function StatsPage() {
  return <WithWorkbook title="Statistics">{(sheetId, workbook) => <StatsView sheetId={sheetId} workbook={workbook} today={todayIso()} />}</WithWorkbook>
}
