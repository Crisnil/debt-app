import { describe, expect, it } from 'vitest'
import { parseWorkbook } from '../data/workbook'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { spendingItems } from './reconcile'
import { filterSpending, NO_CATEGORY, paidFromOptions, spendingByCategory, spendingMonths } from './spending'
import type { Workbook } from './types'

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)
const items = spendingItems(base)

describe('spending page', () => {
  it('lists the months with spending, newest first, and always the current month', () => {
    expect(spendingMonths(items, '2030-03')).toEqual(['2030-03', '2030-01'])
  })

  it('counts each purchase once: matched, statement only, and logged only', () => {
    const jan = filterSpending(items, { month: '2030-01', methodId: '', category: '' })
    expect(jan.map((i) => [i.label, i.amount, i.source])).toEqual([
      ['Sample Cafe', 15000, 'expense'],
      ['Sample Pharmacy', 80000, 'expense'],
      ['Sample Grocer', 250025, 'both'],
      ['SAMPLE FUEL', 120000, 'statement'],
    ])
  })

  it('filters by paid from and by category', () => {
    expect(filterSpending(items, { month: '2030-01', methodId: 'alpha', category: '' }).map((i) => i.label)).toEqual(['Sample Pharmacy', 'Sample Grocer'])
    expect(filterSpending(items, { month: '2030-01', methodId: '', category: 'Grocery' }).map((i) => i.label)).toEqual(['Sample Grocer'])
    expect(filterSpending(items, { month: '2030-02', methodId: '', category: '' })).toEqual([])
  })

  it('names the paid from choices', () => {
    expect(paidFromOptions(base, items)).toEqual([
      { value: 'alpha', label: 'Alpha' },
      { value: 'beta', label: 'Beta' },
      { value: 'cash', label: 'Cash' },
    ])
  })

  it('compares each category with its monthly budget, most spent first', () => {
    const jan = filterSpending(items, { month: '2030-01', methodId: '', category: '' })
    expect(spendingByCategory(base, jan)).toEqual([
      { category: 'Grocery', spent: 250025, budget: 1300000 }, // 3,000/week × 52/12
      { category: 'Gasoline', spent: 120000, budget: 0 },
      { category: 'Health', spent: 80000, budget: 0 },
      { category: 'Food', spent: 15000, budget: 0 },
    ])
  })

  it('keeps budgeted categories with nothing spent, and groups items without a category', () => {
    const wb: Workbook = { ...base, transactions: [{ txnId: 'x', date: '2030-02-02', amount: 5000, merchant: 'Store', category: '', methodId: 'cash', note: '' }] }
    const feb = filterSpending(spendingItems(wb), { month: '2030-02', methodId: '', category: '' })
    expect(spendingByCategory(wb, feb)).toEqual([
      { category: NO_CATEGORY, spent: 5000, budget: 0 },
      { category: 'Grocery', spent: 0, budget: 1300000 },
    ])
    expect(filterSpending(spendingItems(wb), { month: '2030-02', methodId: '', category: NO_CATEGORY })).toHaveLength(1)
  })
})
