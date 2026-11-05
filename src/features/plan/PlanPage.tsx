import { useState } from 'react'
import { todayIso } from '../../domain/dues'
import { monthsUntil, payoffPath } from '../../domain/payoff'
import { billsByMonth, forecastCards, installmentsEnding, monthlyIncome, PAYABLES, withPayables, type CardForecast } from '../../domain/forecast'
import type { Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { FutureBillsChart } from '../../ui/charts/FutureBillsChart'
import { PayoffChart } from '../../ui/charts/PayoffChart'
import { monthLabel } from '../../ui/charts/palette'
import { WithWorkbook } from '../WithWorkbook'

const panel = 'rounded-xl bg-white p-4 shadow-sm'

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
  const result = payoffPath(workbook, today, { cut: cut / 100, excludeIncome: exclude })
  const base = cut === 0 && exclude.length === 0 ? result : payoffPath(workbook, today)
  const end = result.debtFree ?? result.months.at(-1)!.month
  const shown = result.months.slice(0, Math.min(Math.max(result.months.findIndex((m) => m.month === end) + 4, 12), result.months.length))
  const changed = result.debtFree !== base.debtFree || result.interestTotal !== base.interestTotal
  return (
    <div className={panel}>
      <h2 className="font-medium text-slate-900">Payoff path</h2>
      {result.debtFree ? (
        <p className="mt-2 text-3xl font-semibold text-slate-900">
          Debt-free {monthLabel(result.debtFree)}
          <span className="ml-2 align-middle text-sm font-normal text-slate-500">{monthsUntil(today, result.debtFree)} months</span>
        </p>
      ) : (
        <p className="mt-2 text-xl font-semibold text-red-900">▲ Not debt-free within 5 years at this pace</p>
      )}
      <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
        <li>{result.interestStops ? `Interest stops with the ${monthLabel(result.interestStops)} bill` : '▲ The carried balance is not paid off within 5 years'}</li>
        <li>Interest to pay (est.): {formatPeso(result.interestTotal)}</li>
        {changed && (
          <li className="text-green-900">
            What-if vs now: {base.debtFree ? `debt-free ${monthLabel(base.debtFree)}` : 'not debt-free'}, interest {formatPeso(base.interestTotal)}
          </li>
        )}
      </ul>
      <div className="mt-4">
        <PayoffChart months={shown} />
      </div>
      <details className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
        <summary className="cursor-pointer font-medium text-slate-900">What if…</summary>
        <label className="mt-3 block text-slate-700" htmlFor="cut">
          Cut usual card spending by <b>{cut}%</b>
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
        <p className="mt-2 text-xs text-slate-500">
          Not saved. Interest uses each card&apos;s monthly rate until the statement shows the real finance charge. Cash and bank spending are not included yet.
        </p>
      </details>
    </div>
  )
}

/** Looking ahead: bills per month for the next 12 months and when installments end. Later: the payoff path. */
export function PlanPage() {
  return (
    <WithWorkbook title="Plan">
      {(_, workbook) => {
        const today = todayIso()
        const forecasts = forecastCards(workbook, today)
        return (
          <section className="space-y-4">
            <h1 className="text-2xl font-semibold text-slate-900">Plan</h1>
            <PayoffCard workbook={workbook} today={today} />
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
