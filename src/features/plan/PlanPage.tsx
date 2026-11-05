import { todayIso } from '../../domain/dues'
import { billsByMonth, forecastCards, installmentsEnding, monthlyIncome, type CardForecast } from '../../domain/forecast'
import type { Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { FutureBillsChart } from '../../ui/charts/FutureBillsChart'
import { monthLabel } from '../../ui/charts/palette'
import { WithWorkbook } from '../WithWorkbook'

const panel = 'rounded-xl bg-white p-4 shadow-sm'

function FutureBillsCard({ workbook, forecasts, today }: { workbook: Workbook; forecasts: CardForecast[]; today: string }) {
  const months = billsByMonth(forecasts, today)
  return (
    <div className={panel}>
      <h2 className="font-medium text-slate-900">Bills in the next 12 months</h2>
      <p className="mb-3 text-xs text-slate-500">By due month. Later months use your usual spending from the last 3 statements. Tap a month for details.</p>
      <FutureBillsChart months={months} series={forecasts.map((f) => ({ cardId: f.card.cardId, name: f.card.name }))} income={monthlyIncome(workbook)} />
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
