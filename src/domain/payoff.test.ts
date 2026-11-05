import { describe, expect, it } from 'vitest'
import { parseWorkbook } from '../data/workbook'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { payoffInput, payoffPath, runPayoff, type PayoffMonthInput } from './payoff'
import type { Workbook } from './types'

// The model from the vault (05-Tech/projection.py, v3, 2026-10-29): installments per bill month, usual card spending
// 37,693.91, carried 22,347.99 into the first bill, interest 711.09 / 7,615.74 per month, income 84,000,
// electric 1,800 + tuition 6,000 paid outside the cards. Expected values are the script's output.
const INST = [
  4528225, 3021141, 2837704, 1536632, 924931, 924931, 924931, 659812, 659812, 659812, 311315, 239542, 239542, 239542, 239542, 239542, 239542, 0, 0, 0,
]
const RATE = 711.09 / 7615.74

function vaultModel(cut: number) {
  const months: PayoffMonthInput[] = INST.map((installments, i) => {
    const m = 10 + i // 2026-11 = index 10 from 2026-01
    return {
      month: `${2026 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`,
      cardKnown: installments,
      cardEstimate: 3769391,
      installments,
      nonCard: 780000,
      nonCardDebt: 0,
      carriedIn: i === 0 ? 2234799 : 0,
      carriedInterest: i === 0 ? Math.round(2234799 * RATE) : 0,
    }
  })
  return runPayoff({ months, income: 8400000, rate: RATE, cut })
}

describe('payoff path: reproduces the vault model', () => {
  it('current habits: carry peaks in Nov 2026 and is 0 from the Feb 2027 bill', () => {
    const r = vaultModel(0)
    expect(r.months.slice(0, 4).map((m) => m.carried)).toEqual([3121081, 2583032, 1811308, 0])
    expect(r.interestStops).toBe('2027-02')
    expect(r.interestTotal).toBeGreaterThanOrEqual(910389 - 2)
    expect(r.interestTotal).toBeLessThanOrEqual(910389 + 2)
    const dec2027 = r.months.find((m) => m.month === '2027-12')!
    expect(Math.abs(dec2027.savedTotal - 33055465)).toBeLessThanOrEqual(5)
    // The last installment (BPI 24/24) is on the Mar 2028 bill.
    expect(r.debtFree).toBe('2028-03')
  })

  it('a 20% spending cut stops interest a month earlier', () => {
    const r = vaultModel(0.2)
    expect(r.interestStops).toBe('2027-01')
    expect(Math.abs(r.interestTotal - 523521)).toBeLessThanOrEqual(2)
  })
})

describe('payoff path: rules', () => {
  const month = (over: Partial<PayoffMonthInput>): PayoffMonthInput => ({
    month: '2030-01',
    cardKnown: 0,
    cardEstimate: 0,
    installments: 0,
    nonCard: 0,
    nonCardDebt: 0,
    carriedIn: 0,
    carriedInterest: 0,
    ...over,
  })

  it('pays bills outside the cards first, then the card bill, and saves the rest', () => {
    const r = runPayoff({ months: [month({ cardKnown: 500000, nonCard: 200000 })], income: 1000000, rate: 0.03, cut: 0 })
    expect(r.months[0]).toMatchObject({ paid: 700000, carried: 0, saved: 300000 })
  })

  it('carries the unpaid card bill with interest and is not debt-free while carrying at the end', () => {
    const r = runPayoff({ months: [month({ cardKnown: 1500000 }), month({ month: '2030-02' })], income: 1000000, rate: 0.03, cut: 0 })
    expect(r.months.map((m) => [m.carried, m.interest])).toEqual([
      [500000, 0],
      [0, 15000],
    ])
    expect(r.interestStops).toBe('2030-02')
    expect(r.debtFree).toBe('2030-02')
    const stuck = runPayoff({ months: [month({ cardKnown: 3000000 })], income: 1000000, rate: 0.03, cut: 0 })
    expect(stuck.debtFree).toBeNull()
  })

  it('waits for the last payment of a loan outside the cards', () => {
    const months = ['2030-01', '2030-02', '2030-03'].map((m, i) => month({ month: m, nonCard: 100000, nonCardDebt: i < 2 ? 100000 : 0 }))
    expect(runPayoff({ months, income: 1000000, rate: 0.03, cut: 0 }).debtFree).toBe('2030-02')
  })
})

describe('payoff path: from the sheet', () => {
  const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)

  it('builds months from card forecasts, payables, and income in the plan', () => {
    const input = payoffInput(base, '2030-01-21', {}, 6)
    expect(input.income).toBe(4000000)
    expect(input.rate).toBeCloseTo(0.03)
    // January: alpha statement left 3,000.00. February: TV installment; usual spending alpha 1,250.13 − 800 logged + beta 1,200.
    expect(input.months[0]).toMatchObject({ month: '2030-01', cardKnown: 300000, installments: 0 })
    expect(input.months[1]).toMatchObject({ month: '2030-02', installments: 100000, cardEstimate: 45013 + 120000 })
  })

  it('leaves out an income source and applies a spending cut', () => {
    const wb: Workbook = base
    expect(payoffInput(wb, '2030-01-21', { excludeIncome: ['salary'] }, 3).income).toBe(0)
    expect(payoffInput(wb, '2030-01-21', { cut: 0.2 }, 3).cut).toBe(0.2)
  })

  it('finds the debt-free month after the last installment', () => {
    // Alpha TV: last payment on the Apr 2030 bill. Income covers everything, so nothing is carried.
    expect(payoffPath(base, '2030-01-21')).toMatchObject({ interestStops: '2030-01', debtFree: '2030-04' })
  })
})
