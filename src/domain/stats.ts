import type { Centavos } from '../lib/money'
import { addMonths } from './payables'
import type { SpendingItem } from './reconcile'
import { categoryOf } from './spending'
import type { IsoDate } from './types'

export type Period = 'week' | 'month' | 'year'

/** Months the highlights look back over, this month included. */
export const HIGHLIGHT_MONTHS = 12

const toDate = (date: IsoDate) => new Date(`${date}T00:00:00`)
const isoOf = (d: Date): IsoDate => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function addDays(date: IsoDate, days: number): IsoDate {
  const d = toDate(date)
  d.setDate(d.getDate() + days)
  return isoOf(d)
}

/** The first and last day of the week (Monday to Sunday), month, or year that has `date`. */
export function periodRange(period: Period, date: IsoDate): { start: IsoDate; end: IsoDate } {
  if (period === 'year') return { start: `${date.slice(0, 4)}-01-01`, end: `${date.slice(0, 4)}-12-31` }
  if (period === 'month') {
    const next = `${addMonths(date.slice(0, 7), 1)}-01`
    return { start: `${date.slice(0, 7)}-01`, end: addDays(next, -1) }
  }
  const start = addDays(date, -((toDate(date).getDay() + 6) % 7))
  return { start, end: addDays(start, 6) }
}

/** A date in the period `n` periods before (n < 0) or after (n > 0) the one that has `date`. */
export function shiftPeriod(period: Period, date: IsoDate, n: number): IsoDate {
  if (period === 'week') return addDays(date, 7 * n)
  if (period === 'month') return `${addMonths(date.slice(0, 7), n)}-01`
  return `${Number(date.slice(0, 4)) + n}-01-01`
}

/** Short name of the period: "Nov 10 – 16", "Nov 2026", "2026". */
export function periodLabel(period: Period, date: IsoDate): string {
  const { start, end } = periodRange(period, date)
  if (period === 'year') return start.slice(0, 4)
  if (period === 'month') return toDate(start).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })
  const day = (d: IsoDate) => toDate(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  return start.slice(5, 7) === end.slice(5, 7) ? `${day(start)} – ${Number(end.slice(8))}` : `${day(start)} – ${day(end)}`
}

const inRange = (items: SpendingItem[], start: IsoDate, end: IsoDate) => items.filter((i) => i.date >= start && i.date <= end)

/** Total per key, biggest first. Refunds (below 0) lower the total. */
function totals(items: SpendingItem[], keyOf: (i: SpendingItem) => string): { key: string; spent: Centavos }[] {
  const map = new Map<string, Centavos>()
  for (const i of items) map.set(keyOf(i), (map.get(keyOf(i)) ?? 0) + i.amount)
  return [...map].map(([key, spent]) => ({ key, spent })).sort((a, b) => b.spent - a.spent || a.key.localeCompare(b.key))
}

export type CategoryShare = { category: string; spent: Centavos; share: number }

/** Spent per category in the period, most first, with each one's share of the total (0–1). Categories at ₱0 or less are left out. */
export function categoryShares(items: SpendingItem[], period: Period, date: IsoDate): CategoryShare[] {
  const { start, end } = periodRange(period, date)
  const rows = totals(inRange(items, start, end), categoryOf).filter((r) => r.spent > 0)
  const total = rows.reduce((s, r) => s + r.spent, 0)
  return rows.map((r) => ({ category: r.key, spent: r.spent, share: total > 0 ? r.spent / total : 0 }))
}

export type Highlights = {
  highestMonth: { month: string; spent: Centavos } | null
  topCategory: { category: string; spent: Centavos } | null
  highestDay: { date: IsoDate; spent: Centavos } | null
  /** This month so far: spent ÷ days up to today. */
  perDay: Centavos
}

/** Highest month, most spent category, and highest day in the last HIGHLIGHT_MONTHS months; the average per day this month. */
export function spendingHighlights(items: SpendingItem[], today: IsoDate): Highlights {
  const recent = inRange(items, `${addMonths(today.slice(0, 7), 1 - HIGHLIGHT_MONTHS)}-01`, today)
  const top = <T,>(rows: { key: string; spent: Centavos }[], make: (key: string, spent: Centavos) => T): T | null =>
    rows[0] && rows[0].spent > 0 ? make(rows[0].key, rows[0].spent) : null
  const thisMonth = inRange(recent, `${today.slice(0, 7)}-01`, today).reduce((s, i) => s + i.amount, 0)
  return {
    highestMonth: top(totals(recent, (i) => i.date.slice(0, 7)), (month, spent) => ({ month, spent })),
    topCategory: top(totals(recent, categoryOf), (category, spent) => ({ category, spent })),
    highestDay: top(totals(recent, (i) => i.date), (date, spent) => ({ date, spent })),
    perDay: Math.round(Math.max(thisMonth, 0) / Number(today.slice(8, 10))),
  }
}
