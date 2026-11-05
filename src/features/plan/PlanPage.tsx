import { useState } from 'react'
import { todayIso } from '../../domain/dues'
import { MIN_CASH_DAYS, monthsUntil, payoffPaths, type PayoffResult } from '../../domain/payoff'
import { billsByMonth, forecastCards, installmentsEnding, monthlyIncome, PAYABLES, withPayables, type CardForecast } from '../../domain/forecast'
import type { Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { FutureBillsChart } from '../../ui/charts/FutureBillsChart'
import { PayoffChart, type ChartPath } from '../../ui/charts/PayoffChart'
import { monthLabel } from '../../ui/charts/palette'
import { WithWorkbook } from '../WithWorkbook'
import { PlannedExpenses } from './PlannedExpenses'

const panel = 'rounded-xl bg-white p-4 shadow-sm'

const shortDay = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })

function FutureBillsCard({ workbook, forecasts, today }: { workbook: Workbook; forecasts: CardForecast[]; today: string }) {
  const months = withPayables(billsByMonth(forecasts, today), workbook)
  const series = [...forecasts.map((f) => ({ cardId: f.card.cardId, name: f.card.name })), { cardId: PAYABLES, name: 'Bills & payables' }]
  return (
    <div className={panel}>
      <h2 className="font-medium text-slate-900">Bills in the next 12 months</h2>
      <p className="mb-3 text-xs text-slate-500">By due month: cards, bills, and money you owe. Later card bills use your usual spending from the last 3 statements. Tap a month for details.</p>
      <FutureBillsChart months={months} series={series} income={monthlyIncome(workbook)} />
    </div>
  )
}

function EndingCard({ forecasts }: { forecasts: CardForecast[] }) {
  const ending = installmentsEnding(forecasts)
  if (ending.length === 0) return null
  const name = (cardId: string) => forecasts.find((f) => f.card.cardId === cardId)?.card.name ?? cardId
  return (
    <div className={panel}>
      <h2 className="font-medium text-slate-900">Installments ending</h2>
      <p className="mb-2 text-xs text-slate-500">After the last payment, your bills drop by this much each month.</p>
      <ul className="divide-y divide-slate-100 text-sm">
        {ending.map((e) => (
          <li key={e.lastDue} className="py-2">
            <p className="flex items-baseline justify-between">
              <span className="font-medium text-slate-900">{monthLabel(e.lastDue)}</span>
              <span className="text-slate-800">−{formatPeso(e.monthly)}/mo</span>
            </p>
            <p className="text-xs text-slate-500">
              Last payment: {e.plans.map((p) => `${p.description} (${name(p.cardId)})`).join(', ')}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Debt-free date, when interest stops, and the path month by month, with what-if controls (not saved). */
export function PayoffCard({ workbook, today }: { workbook: Workbook; today: string }) {
  const [cut, setCut] = useState(0)
  const [exclude, setExclude] = useState<string[]>([])
  const sources = workbook.incomeSources.filter((s) => s.active && s.inPlan)
  const paths = payoffPaths(workbook, today, { cut: cut / 100, excludeIncome: exclude })
  const base = cut === 0 && exclude.length === 0 ? paths : payoffPaths(workbook, today)
  const list: (ChartPath & { result: PayoffResult; living?: string })[] = []
  if (paths.actual) {
    const a = paths.actual
    const l = a.living
    const basis =
      l.cashBasis?.kind === 'months'
        ? `avg of ${l.cashBasis.months.map((m) => monthLabel(m, false)).join(', ')}`
        : l.cashBasis?.kind === 'partial'
          ? `${shortDay(l.cashBasis.from)}–${shortDay(l.cashBasis.to)}, scaled to a month`
          : ''
    const cash = l.cash === null ? `cash not counted yet (needs ${MIN_CASH_DAYS} days of entries)` : `cash and bank ${formatPeso(l.cash)} (${basis})`
    list.push({
      key: 'actual',
      label: l.cash === null ? 'Actual (cards only so far)' : 'Actual',
      dashed: false,
      months: a.result.months,
      result: a.result,
      living: `${formatPeso(l.monthly)}/mo · cards ${formatPeso(l.card)} (last 3 statements) + ${cash}`,
    })
  }
  if (paths.planned) list.push({ key: 'plan', label: 'Plan', dashed: true, months: paths.planned.result.months, result: paths.planned.result, living: `${formatPeso(paths.planned.living)}/mo planned` })
  if (list.length === 0) list.push({ key: 'cards', label: 'Card spending only', dashed: false, months: paths.cards.months, result: paths.cards })
  const main = list[0].result
  const lastNeeded = Math.max(...list.map((p) => (p.result.debtFree ? p.result.months.findIndex((m) => m.month === p.result.debtFree) : p.result.months.length - 4)))
  const count = Math.min(Math.max(lastNeeded + 4, 12), main.months.length)
  const shown = list.map((p) => ({ ...p, months: p.months.slice(0, count) }))
  const changed = main.debtFree !== base.main.debtFree || main.interestTotal !== base.main.interestTotal
  const free = (r: PayoffResult) => (r.debtFree ? monthLabel(r.debtFree) : 'not within 5 years')

  return (
    <div className={panel}>
      <h2 className="font-medium text-slate-900">Payoff path</h2>
      {main.debtFree ? (
        <p className="mt-2 text-3xl font-semibold text-slate-900">
          Debt-free {monthLabel(main.debtFree)}
          <span className="ml-2 align-middle text-sm font-normal text-slate-500">
            {monthsUntil(today, main.debtFree)} months{list.length > 1 ? ` · ${list[0].label.toLowerCase()}` : ''}
          </span>
        </p>
      ) : (
        <p className="mt-2 text-xl font-semibold text-red-900">▲ Not debt-free within 5 years at this pace</p>
      )}
      <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
        {list.length > 1 && (
          <li>
            {list.map((p) => `${p.label}: debt-free ${free(p.result)}`).join(' · ')}
          </li>
        )}
        <li>{main.interestStops ? `Interest stops with the ${monthLabel(main.interestStops)} bill` : '▲ The carried balance is not paid off within 5 years'}</li>
        <li>Interest to pay (est.): {formatPeso(main.interestTotal)}</li>
        {list
          .filter((p) => p.living)
          .map((p) => (
            <li key={p.key} className="text-xs text-slate-500">
              {p.label} living costs: {p.living}
            </li>
          ))}
        {paths.planned && !paths.actual && <li className="text-xs text-slate-500">The Actual line starts with your first statement lines or {MIN_CASH_DAYS} days of entries.</li>}
        {!paths.planned && <li className="text-xs text-slate-500">Add your planned monthly expenses below to see the Plan line. Cash spending is not counted until then.</li>}
        {changed && (
          <li className="text-green-900">
            What-if vs now: debt-free {free(base.main)}, interest {formatPeso(base.main.interestTotal)}
          </li>
        )}
      </ul>
      <div className="mt-4">
        <PayoffChart paths={shown} />
      </div>
      <details className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
        <summary className="cursor-pointer font-medium text-slate-900">What if…</summary>
        <label className="mt-3 block text-slate-700" htmlFor="cut">
          Cut spending by <b>{cut}%</b>
        </label>
        <input id="cut" type="range" min={0} max={30} step={5} value={cut} onChange={(e) => setCut(Number(e.target.value))} className="w-full accent-green-900" />
        {sources.length > 0 && (
          <fieldset className="mt-3">
            <legend className="text-slate-700">Income in the plan</legend>
            {sources.map((s) => (
              <label key={s.sourceId} className="mt-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!exclude.includes(s.sourceId)}
                  onChange={(e) => setExclude(e.target.checked ? exclude.filter((x) => x !== s.sourceId) : [...exclude, s.sourceId])}
                />
                {s.label}
              </label>
            ))}
          </fieldset>
        )}
        <p className="mt-2 text-xs text-slate-500">Not saved. Interest uses each card&apos;s monthly rate until the statement shows the real finance charge.</p>
      </details>
    </div>
  )
}

/** Looking ahead: bills per month for the next 12 months and when installments end. Later: the payoff path. */
export function PlanPage() {
  return (
    <WithWorkbook title="Plan">
      {(sheetId, workbook) => {
        const today = todayIso()
        const forecasts = forecastCards(workbook, today)
        return (
          <section className="space-y-4">
            <h1 className="text-2xl font-semibold text-slate-900">Plan</h1>
            <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-6 lg:space-y-0">
              <PayoffCard workbook={workbook} today={today} />
              <PlannedExpenses sheetId={sheetId} workbook={workbook} />
            </div>
            <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-6 lg:space-y-0">
              <FutureBillsCard workbook={workbook} forecasts={forecasts} today={today} />
              <EndingCard forecasts={forecasts} />
            </div>
          </section>
        )
      }}
    </WithWorkbook>
  )
}
