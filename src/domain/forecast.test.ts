import { describe, expect, it } from 'vitest'
import { parseWorkbook } from '../data/workbook'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { billsByMonth, forecastCard, forecastCards, installmentsEnding, monthlyIncome, usualSpending } from './forecast'
import type { Workbook } from './types'

// Fixture card alpha: statement 2030-01-10 (due 01-30), 4,000.75 due, 1,000.75 paid on 01-15.
// Installments on it: TV 1,000.00 (3/6) and fridge 500.50 (2/2, last). Logged, not billed: pharmacy 800.00 on 01-11.
const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)
const alpha = base.cards.find((c) => c.cardId === 'alpha')!

describe('forecastCard', () => {
  it('starts with the unpaid statement, then the next bill with installments, logged and usual spending', () => {
    const f = forecastCard(base, alpha, '2030-01-21')
    expect(f.bills[0]).toMatchObject({ bill: { statementDate: '2030-01-10', dueDate: '2030-01-30' }, statementLeft: 300000, total: 300000 })
    // Usual spending: 2,500.25 straight over 2 statements = 1,250.13; 800.00 is logged already.
    expect(f.bills[1]).toMatchObject({
      bill: { statementDate: '2030-02-10', dueDate: '2030-02-28' },
      installments: 100000,
      purchases: 80000,
      estimate: 45013,
      carried: 0,
      fromStatement: false,
      total: 225013,
    })
  })

  it('stops each installment after its last term', () => {
    const f = forecastCard(base, alpha, '2030-01-21')
    const installments = Object.fromEntries(f.bills.map((b) => [b.bill.statementDate, b.installments]))
    expect(installments['2030-03-10']).toBe(100000)
    expect(installments['2030-04-10']).toBe(100000)
    expect(installments['2030-05-10']).toBe(0)
  })

  it('carries the unpaid balance with estimated interest after the due date', () => {
    const f = forecastCard(base, alpha, '2030-02-01')
    expect(f.bills[0]).toMatchObject({ bill: { statementDate: '2030-02-10' }, carried: 309000 }) // 3,000.00 + 3%
  })

  it('uses the statement lines when they are in the sheet', () => {
    const wb: Workbook = {
      ...base,
      lines: [
        ...base.lines,
        { cardId: 'alpha', row: 20, statementDate: '2030-02-10', postDate: '2030-01-11', txnDate: '2030-01-11', description: 'SAMPLE PHARMACY', type: 'straight', amount: 80000, termNo: null, totalTerms: null, category: '', linkedTxnId: 't3' },
        { cardId: 'alpha', row: 21, statementDate: '2030-02-10', postDate: '2030-01-20', txnDate: '2030-01-20', description: 'SAMPLE TV', type: 'installment', amount: 100000, termNo: 4, totalTerms: 6, category: '', linkedTxnId: '' },
        { cardId: 'alpha', row: 22, statementDate: '2030-02-10', postDate: '2030-02-10', txnDate: '2030-02-10', description: 'FINANCE CHARGE', type: 'interest', amount: 5000, termNo: null, totalTerms: null, category: '', linkedTxnId: '' },
      ],
    }
    const feb = forecastCard(wb, alpha, '2030-02-01').bills[0]
    // Interest is on the statement, so no estimate is added to the carried amount.
    expect(feb).toMatchObject({ fromStatement: true, installments: 100000, purchases: 80000, fees: 5000, carried: 300000, estimate: 0 })
  })

  it('adds up what is owed and compares it with the credit limit', () => {
    const f = forecastCard(base, { ...alpha, creditLimit: 2000000 }, '2030-01-21')
    // 8,000.00 outstanding − 1,000.75 paid + 800.00 logged + TV 3 × 1,000.00 not billed yet
    expect(f.owed).toBe(1079925)
    expect(f.used).toBeCloseTo(0.54, 2)
    expect(forecastCard(base, alpha, '2030-01-21').used).toBeNull()
  })
})

describe('summaries', () => {
  it('averages straight purchases and refunds over the last statements', () => {
    expect(usualSpending(base.lines.filter((l) => l.cardId === 'alpha'))).toBe(125013)
  })

  it('groups bills by due month', () => {
    const months = billsByMonth(forecastCards(base, '2030-01-21'), '2030-01-21')
    expect(months).toHaveLength(12)
    expect(months[0]).toMatchObject({ month: '2030-01', total: 300000 })
    expect(months[1].month).toBe('2030-02')
    expect(months[1].byCard.find((c) => c.cardId === 'alpha')).toMatchObject({ committed: 180000, estimate: 45013 })
  })

  it('lists installments by the month of their last payment', () => {
    expect(installmentsEnding(forecastCards(base, '2030-01-21'))).toEqual([
      { lastDue: '2030-04', monthly: 100000, plans: [expect.objectContaining({ description: 'SAMPLE TV', termsLeft: 3 })] },
    ])
  })

  it('counts income per payday', () => {
    expect(monthlyIncome(base)).toBe(4000000) // 20,000 × 2 paydays
  })
})
