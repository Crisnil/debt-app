import type { Centavos } from '../lib/money'
import { savedInMonth, savingsGoal } from './balances'
import type { CardForecast } from './forecast'
import { monthlyIncome } from './forecast'
import { addMonths } from './payables'
import { spendingItems } from './reconcile'
import { WEEKS_PER_MONTH } from './spending'
import type { IsoDate, Workbook } from './types'

/** Good → watch → careful → bad. Each gauge maps its ratio to one of these. */
export type Health = 'good' | 'watch' | 'careful' | 'bad'

/** Owed on cards ÷ credit limits: under 30% good, under 50% watch, under 75% careful, else bad. */
export function debtHealth(used: number): Health {
  return used < 0.3 ? 'good' : used < 0.5 ? 'watch' : used < 0.75 ? 'careful' : 'bad'
}

/** Saved this month ÷ goal: 100% good, 50% watch, 25% careful, else bad. */
export function savingsHealth(ratio: number): Health {
  return ratio >= 1 ? 'good' : ratio >= 0.5 ? 'watch' : ratio >= 0.25 ? 'careful' : 'bad'
}

/** Spent ÷ budget for the days so far: up to 90% good, up to 100% watch, up to 115% careful, else bad. */
export function spendingHealth(ratio: number): Health {
  return ratio <= 0.9 ? 'good' : ratio <= 1 ? 'watch' : ratio <= 1.15 ? 'careful' : 'bad'
}

export type DebtGauge = { owed: Centavos; limit: Centavos; used: number | null }

/** Cards with a credit limit only: owed on them ÷ their limits. null when no limit is set. */
export function debtGauge(forecasts: CardForecast[]): DebtGauge {
  const withLimit = forecasts.filter((f) => f.card.creditLimit)
  const owed = withLimit.reduce((s, f) => s + f.owed, 0)
  const limit = withLimit.reduce((s, f) => s + f.card.creditLimit!, 0)
  return { owed, limit, used: limit > 0 ? owed / limit : null }
}

export type SavingsGauge = { saved: Centavos; goal: Centavos; ratio: number | null; lastMonth: Centavos }

export function savingsGauge(wb: Workbook, today: IsoDate): SavingsGauge {
  const month = today.slice(0, 7)
  const saved = savedInMonth(wb, month)
  const goal = savingsGoal(wb, month)
  return { saved, goal, ratio: goal > 0 ? saved / goal : null, lastMonth: savedInMonth(wb, addMonths(month, -1)) }
}

export type SpendingGauge = {
  spent: Centavos
  /** What the budget allows for the days so far this month. */
  pace: Centavos
  /** budget: weekly budgets from the Categories tab. income: no budgets set, so the monthly income is used. */
  basis: 'budget' | 'income' | 'none'
  ratio: number | null
  /** Spent last month up to the same day. */
  lastMonth: Centavos
}

/** Spending this month (each purchase once) against the budget for the days so far. */
export function spendingGauge(wb: Workbook, today: IsoDate): SpendingGauge {
  const month = today.slice(0, 7)
  const day = Number(today.slice(8, 10))
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
  const items = spendingItems(wb)
  const spentIn = (m: string, upToDay: number) =>
    items.filter((i) => i.date.startsWith(m) && Number(i.date.slice(8, 10)) <= upToDay).reduce((s, i) => s + i.amount, 0)
  const weekly = wb.categories.reduce((s, c) => s + c.weeklyBudget, 0)
  const monthly = weekly > 0 ? Math.round(weekly * WEEKS_PER_MONTH) : monthlyIncome(wb)
  const basis = weekly > 0 ? 'budget' : monthly > 0 ? 'income' : 'none'
  const pace = Math.round((monthly * day) / daysInMonth)
  const spent = spentIn(month, day)
  return { spent, pace, basis, ratio: pace > 0 ? spent / pace : null, lastMonth: spentIn(addMonths(month, -1), day) }
}
