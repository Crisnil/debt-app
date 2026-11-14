import { describe, expect, it } from 'vitest'
import type { SpendingItem } from './reconcile'
import { categoryShares, periodLabel, periodRange, shiftPeriod, spendingHighlights } from './stats'

const item = (date: string, amount: number, category: string): SpendingItem => ({ date, amount, category, label: category, methodId: 'cash', source: 'expense' })

const items = [
  item('2029-12-05', 900000, 'Rent'),
  item('2030-01-03', 250000, 'Grocery'),
  item('2030-01-03', 50000, 'Food'),
  item('2030-01-12', 150000, 'Food'),
  item('2030-01-14', -20000, 'Food'), // refund
  item('2030-01-20', 100000, 'Grocery'),
  item('2028-12-31', 9999999, 'Old'), // more than 12 months ago
]

describe('stats periods', () => {
  it('finds the week (Monday to Sunday), month, and year of a date', () => {
    // 2030-01-16 is a Wednesday.
    expect(periodRange('week', '2030-01-16')).toEqual({ start: '2030-01-14', end: '2030-01-20' })
    expect(periodRange('week', '2030-01-20')).toEqual({ start: '2030-01-14', end: '2030-01-20' })
    expect(periodRange('month', '2030-02-10')).toEqual({ start: '2030-02-01', end: '2030-02-28' })
    expect(periodRange('year', '2030-06-01')).toEqual({ start: '2030-01-01', end: '2030-12-31' })
  })

  it('moves a period back and forward', () => {
    expect(shiftPeriod('week', '2030-01-16', -1)).toBe('2030-01-09')
    expect(shiftPeriod('month', '2030-01-31', -1)).toBe('2029-12-01')
    expect(shiftPeriod('year', '2030-05-05', 1)).toBe('2031-01-01')
  })

  it('names a period', () => {
    expect(periodLabel('week', '2030-01-16')).toBe('Jan 14 – 20')
    expect(periodLabel('week', '2030-01-30')).toBe('Jan 28 – Feb 3')
    expect(periodLabel('month', '2030-01-16')).toBe('Jan 2030')
    expect(periodLabel('year', '2030-01-16')).toBe('2030')
  })
})

describe('spending stats', () => {
  it('splits a period by category, most first, net of refunds, with shares', () => {
    expect(categoryShares(items, 'month', '2030-01-21')).toEqual([
      { category: 'Grocery', spent: 350000, share: 350000 / 530000 },
      { category: 'Food', spent: 180000, share: 180000 / 530000 },
    ])
    expect(categoryShares(items, 'week', '2030-01-16')).toEqual([{ category: 'Grocery', spent: 100000, share: 1 }])
  })

  it('finds the highest month, category, and day in the last 12 months, and the average per day this month', () => {
    expect(spendingHighlights(items, '2030-01-21')).toEqual({
      highestMonth: { month: '2029-12', spent: 900000 },
      topCategory: { category: 'Rent', spent: 900000 },
      highestDay: { date: '2029-12-05', spent: 900000 },
      perDay: Math.round(530000 / 21),
    })
  })

  it('has no highlights without spending', () => {
    expect(spendingHighlights([], '2030-01-21')).toEqual({ highestMonth: null, topCategory: null, highestDay: null, perDay: 0 })
  })
})
