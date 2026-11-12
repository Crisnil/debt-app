import type { Centavos } from '../lib/money'
import { accountLabel } from './accounts'
import type { SpendingItem } from './reconcile'
import type { Workbook } from './types'

export const WEEKS_PER_MONTH = 52 / 12

/** Shown for an item without a category. */
export const NO_CATEGORY = 'No category'

export type SpendingFilter = { month: string; methodId: string; category: string }

export const categoryOf = (item: SpendingItem) => item.category || NO_CATEGORY

/** Months (YYYY-MM) with spending, newest first. Always includes the current month. */
export function spendingMonths(items: SpendingItem[], currentMonth: string): string[] {
  const months = new Set(items.map((i) => i.date.slice(0, 7)))
  months.add(currentMonth)
  return [...months].sort().reverse()
}

/** Items in the month, then for one "Paid from" and one category when set ('' = all). */
export function filterSpending(items: SpendingItem[], filter: SpendingFilter): SpendingItem[] {
  return items.filter(
    (i) =>
      i.date.startsWith(filter.month) &&
      (!filter.methodId || i.methodId === filter.methodId) &&
      (!filter.category || categoryOf(i) === filter.category),
  )
}

/** "Paid from" choices for the items, by label. */
export function paidFromOptions(wb: Workbook, items: SpendingItem[]): { value: string; label: string }[] {
  const ids = [...new Set(items.map((i) => i.methodId))]
  return ids.map((id) => ({ value: id, label: accountLabel(wb, id) })).sort((a, b) => a.label.localeCompare(b.label))
}

export type CategorySpending = {
  category: string
  spent: Centavos
  /** Monthly budget = weekly budget × 52/12. 0 = no budget. */
  budget: Centavos
}

/**
 * Spent per category in the items against the monthly budget from the Categories tab.
 * Categories with a budget are listed even when nothing is spent. Most spent first.
 */
export function spendingByCategory(wb: Workbook, items: SpendingItem[]): CategorySpending[] {
  const rows = new Map<string, CategorySpending>()
  for (const c of wb.categories) {
    if (c.weeklyBudget > 0) rows.set(c.category, { category: c.category, spent: 0, budget: Math.round(c.weeklyBudget * WEEKS_PER_MONTH) })
  }
  for (const i of items) {
    const name = categoryOf(i)
    const row = rows.get(name) ?? { category: name, spent: 0, budget: 0 }
    row.spent += i.amount
    rows.set(name, row)
  }
  return [...rows.values()].sort((a, b) => b.spent - a.spent || a.category.localeCompare(b.category))
}
