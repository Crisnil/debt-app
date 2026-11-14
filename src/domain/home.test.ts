import { describe, expect, it } from 'vitest'
import { parseWorkbook } from '../data/workbook'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { forecastCards } from './forecast'
import { carriedAlerts, dueItems, lastInstallment, monthlyFlow, nextDrop, owedParts, savingsParts, thisMonth } from './home'
import type { Workbook } from './types'

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)
const TODAY = '2030-01-21'
const forecasts = forecastCards(base, TODAY)

describe('home summary', () => {
  it('lists what we owe per card and leaves out zero parts', () => {
    // Beta was paid in full and has nothing new; there are no payables.
    expect(owedParts(base, forecasts, TODAY)).toEqual([{ id: 'alpha', name: 'Alpha', amount: 1079925, to: '/cards/alpha' }])
  })

  it('adds payables as their own part', () => {
    const wb: Workbook = {
      ...base,
      payables: [{ payableId: 'p', name: 'Sample loan', payee: '', category: 'Debt repayment', amount: 200000, recurring: true, dueDay: 15, startMonth: '2030-01', times: 2, active: true, note: '', cardId: '', row: 2 }],
    }
    expect(owedParts(wb, forecastCards(wb, TODAY), TODAY).at(-1)).toEqual({ id: 'payables', name: 'Bills & payables', amount: 400000, to: '/bills' })
  })

  it('counts only savings accounts as savings', () => {
    // Piggy Bank: 5,000 opening + 300 in − 100 out. Payroll and Cash are not savings.
    expect(savingsParts(base)).toEqual([{ id: 'piggy', name: 'Piggy Bank', amount: 520000 }])
  })

  it('finds the last installment and the next drop in bills', () => {
    expect(lastInstallment(forecasts, TODAY)).toEqual({ month: '2030-04', monthsLeft: 3 })
    expect(nextDrop(forecasts, TODAY)).toMatchObject({ lastDue: '2030-04', monthly: 100000 })
  })

  it('lists what is due within the days asked', () => {
    expect(dueItems(base, forecasts, TODAY, 7)).toEqual([])
    expect(dueItems(base, forecasts, TODAY, 14)).toEqual([expect.objectContaining({ name: 'Alpha', amount: 300000, dueDate: '2030-01-30', detail: 'left on the statement' })])
  })

  it('warns about a carried balance and its interest after the due date', () => {
    expect(carriedAlerts(forecastCards(base, '2030-02-01'))).toEqual([{ cardId: 'alpha', name: 'Alpha', carried: 300000, interest: 9000, statementDate: '2030-02-10' }])
  })

  it('sums the bills due this month against the income', () => {
    expect(thisMonth(base, forecasts, TODAY)).toEqual({ month: '2030-01', bills: 300000, income: 4000000, interest: 0 })
  })

  it('gives spending and money moved to savings per month, oldest first, net of moves out of savings', () => {
    // Dec: ₱999 into Piggy Bank. Jan: ₱300 in, ₱100 out.
    expect(monthlyFlow(base, TODAY, 3)).toEqual([
      { month: '2029-11', spent: 0, saved: 0 },
      { month: '2029-12', spent: 0, saved: 99900 },
      { month: '2030-01', spent: 465025, saved: 20000 },
    ])
  })
})
