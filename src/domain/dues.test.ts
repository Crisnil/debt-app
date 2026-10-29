import { describe, expect, it } from 'vitest'
import { parseWorkbook } from '../data/workbook'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { daysBetween, summarizeDues, todayIso } from './dues'

const wb = parseWorkbook('Sample', fixtureTabs, fixtureValues)

describe('summarizeDues', () => {
  const dues = summarizeDues(wb, '2030-01-21')
  const alpha = dues.cards.find((c) => c.card.cardId === 'alpha')!
  const beta = dues.cards.find((c) => c.card.cardId === 'beta')!

  it('uses the latest statement and subtracts payments made since then', () => {
    expect(alpha.snapshot?.asOf).toBe('2030-01-10')
    expect(alpha.paidSinceStatement).toBe(100075) // the 2030-01-09 payment is before the statement
    expect(alpha.remainingDue).toBe(300000)
    expect(alpha.status).toBe('due')
    expect(alpha.daysToDue).toBe(9)
  })

  it('marks a fully paid card as paid', () => {
    expect(beta.remainingDue).toBe(0)
    expect(beta.status).toBe('paid')
  })

  it('counts only installments with months left after the latest statement', () => {
    // TV 3/6 -> 3 months left. Fridge 2/2 -> finished.
    expect(alpha.installmentCount).toBe(1)
    expect(alpha.installmentsMonthly).toBe(100000)
    expect(alpha.installmentsRemaining).toBe(300000)
    expect(alpha.lastInstallmentMonths).toBe(3)
  })

  it('skips closed cards and sorts by due date', () => {
    expect(dues.cards.map((c) => c.card.cardId)).toEqual(['beta', 'alpha'])
    expect(dues.totalRemainingDue).toBe(300000)
  })

  it('marks an unpaid card past its due date as overdue', () => {
    const late = summarizeDues(wb, '2030-02-02').cards.find((c) => c.card.cardId === 'alpha')!
    expect(late.status).toBe('overdue')
    expect(late.daysToDue).toBe(-3)
  })
})

describe('dates', () => {
  it('counts days between ISO dates', () => {
    expect(daysBetween('2030-01-30', '2030-02-02')).toBe(3)
  })

  it('uses the local date', () => {
    expect(todayIso(new Date(2030, 0, 5, 7, 0))).toBe('2030-01-05')
  })
})
