import type { Centavos } from '../lib/money'
import { savedInMonth, savingsGoal } from './balances'
import type { CardForecast } from './forecast'
import { monthlyIncome } from './forecast'
import { addMonths } from './payables'
import { linkedPayable, plannedLineDone, plannedLineIn, plannedLiving } from './payoff'
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
  /** The budget for the whole month. */
  monthly: Centavos
  /**
   * plan: the Planned monthly expenses (Plan page). budget: no plan, so the weekly budgets from the Categories tab.
   * income: no plan and no budgets, so the monthly income is used.
   */
  basis: 'plan' | 'budget' | 'income' | 'none'
  ratio: number | null
  /** Spent last month up to the same day. */
  lastMonth: Centavos
}

/**
 * The Plan for the days so far: a line from a bill counts in full once its due day has passed;
 * other lines are spread evenly over the month. null when the Plan has no amount this month.
 */
export function planPace(wb: Workbook, month: string, day: number): { monthly: Centavos; pace: Centavos } | null {
  const monthly = plannedLiving(wb, month)
  if (!monthly) return null
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
  let pace = 0
  for (const line of wb.plannedExpenses) {
    if (!plannedLineIn(wb, line, month) || plannedLineDone(wb, line, month)) continue
    const bill = linkedPayable(wb, line)
    if (bill) {
      if (day >= Math.min(bill.dueDay ?? daysInMonth, daysInMonth)) pace += line.amount
    } else pace += Math.round((line.amount * day) / daysInMonth)
  }
  return { monthly, pace }
}

/** Spending this month (each purchase once) against the Plan (or budget) for the days so far. */
export function spendingGauge(wb: Workbook, today: IsoDate): SpendingGauge {
  const month = today.slice(0, 7)
  const day = Number(today.slice(8, 10))
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
  const items = spendingItems(wb)
  const spentIn = (m: string, upToDay: number) =>
    items.filter((i) => i.date.startsWith(m) && Number(i.date.slice(8, 10)) <= upToDay).reduce((s, i) => s + i.amount, 0)
  const spent = spentIn(month, day)
  const lastMonth = spentIn(addMonths(month, -1), day)
  const plan = planPace(wb, month, day)
  if (plan) return { spent, ...plan, basis: 'plan', ratio: plan.pace > 0 ? spent / plan.pace : null, lastMonth }
  const weekly = wb.categories.reduce((s, c) => s + c.weeklyBudget, 0)
  const monthly = weekly > 0 ? Math.round(weekly * WEEKS_PER_MONTH) : monthlyIncome(wb)
  const basis = weekly > 0 ? 'budget' : monthly > 0 ? 'income' : 'none'
  const pace = Math.round((monthly * day) / daysInMonth)
  return { spent, pace, monthly, basis, ratio: pace > 0 ? spent / pace : null, lastMonth }
}
