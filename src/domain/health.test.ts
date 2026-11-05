import { describe, expect, it } from 'vitest'
import { parseWorkbook } from '../data/workbook'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { forecastCards } from './forecast'
import { debtGauge, debtHealth, savingsGauge, savingsHealth, spendingGauge, spendingHealth } from './health'
import type { Transaction, Workbook } from './types'

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)

const cash = (txnId: string, date: string, amount: number): Transaction => ({ txnId, date, amount, merchant: 'M', category: 'Food', methodId: 'cash', note: '' })

describe('health levels', () => {
  it('rates debt used: under 30% good, under 50% watch, under 75% careful, else buried', () => {
    expect([0.29, 0.3, 0.49, 0.5, 0.74, 0.75, 1.2].map(debtHealth)).toEqual(['good', 'watch', 'watch', 'careful', 'careful', 'bad', 'bad'])
  })

  it('rates savings against the goal: 100% good, 50% watch, 25% careful', () => {
    expect([1, 0.99, 0.5, 0.49, 0.25, 0.24].map(savingsHealth)).toEqual(['good', 'watch', 'watch', 'careful', 'careful', 'bad'])
  })

  it('rates spending against the pace: up to 90% good, 100% watch, 115% careful', () => {
    expect([0.9, 0.91, 1, 1.01, 1.15, 1.16].map(spendingHealth)).toEqual(['good', 'watch', 'watch', 'careful', 'careful', 'bad'])
  })
})

describe('gauges', () => {
  it('compares owed with the limits of the cards that have one', () => {
    const wb: Workbook = { ...base, cards: base.cards.map((c) => (c.cardId === 'alpha' ? { ...c, creditLimit: 2000000 } : c)) }
    const g = debtGauge(forecastCards(wb, '2030-01-21'))
    expect(g).toMatchObject({ owed: 1079925, limit: 2000000 }) // beta has no limit, so it is left out
    expect(g.used).toBeCloseTo(0.54, 2)
    expect(debtGauge(forecastCards(base, '2030-01-21')).used).toBeNull()
  })

  it('compares saved this month with the goal and keeps last month for the arrow', () => {
    // Fixture: 300 into savings on 01-14, 100 out on 01-16; goal 500 per month. December: 999 into savings.
    expect(savingsGauge(base, '2030-01-20')).toEqual({ saved: 20000, goal: 50000, ratio: 0.4, lastMonth: 99900 })
  })

  it('compares spending with the weekly budgets for the days so far, and last month to the same day', () => {
    const wb: Workbook = { ...base, transactions: [cash('a', '2030-01-05', 100000), cash('b', '2030-01-25', 500000), cash('c', '2029-12-03', 70000), cash('d', '2029-12-20', 90000)] }
    const g = spendingGauge(wb, '2030-01-10')
    // Budget: Grocery 3,000/week × 52/12 = 13,000/month; 10 of 31 days = 4,193.55.
    expect(g.basis).toBe('budget')
    expect(g.pace).toBe(419355)
    // January up to the 10th: cash 1,000 + statement lines alpha grocer 2,500.25 (Jan 4) and beta fuel 1,200 (Jan 1).
    // The logged pharmacy (01-11) and cash 5,000 (01-25) are after the 10th.
    expect(g.spent).toBe(100000 + 250025 + 120000)
    expect(g.lastMonth).toBe(70000)
  })

  it('uses the monthly income when no weekly budget is set', () => {
    const wb: Workbook = { ...base, categories: base.categories.map((c) => ({ ...c, weeklyBudget: 0 })) }
    const g = spendingGauge(wb, '2030-01-31')
    expect(g).toMatchObject({ basis: 'income', pace: 4000000 })
  })
})
