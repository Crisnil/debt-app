import { describe, expect, it } from 'vitest'
import { parseWorkbook } from '../data/workbook'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { actualLiving, payoffInput, payoffPaths, plannedLiving } from './payoff'
import type { Payable, Transaction, Workbook } from './types'

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)

const cash = (txnId: string, date: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  txnId,
  date,
  amount,
  merchant: 'M',
  category: 'Food',
  methodId: 'cash',
  note: '',
  ...extra,
})

const payable = (over: Partial<Payable>): Payable => ({
  payableId: 'p',
  name: 'Sample',
  payee: '',
  category: 'Utilities',
  amount: 100000,
  recurring: true,
  dueDay: 20,
  startMonth: '2030-01',
  times: null,
  active: true,
  note: '',
  row: 2,
  ...over,
})

const planned = (amounts: number[]): Workbook['plannedExpenses'] => amounts.map((amount, i) => ({ itemId: `i${i}`, name: `Item ${i}`, amount, active: true, row: i + 2 }))

describe('planned living costs', () => {
  it('is the total of the active planned expense lines, or null when there are none', () => {
    expect(plannedLiving(base)).toBeNull()
    const wb: Workbook = { ...base, plannedExpenses: [...planned([500000, 169900]), { itemId: 'x', name: 'Old', amount: 99999, active: false, row: 9 }] }
    expect(plannedLiving(wb)).toBe(669900)
  })
})

describe('actual living costs', () => {
  it('starts after the first full month of entries', () => {
    // Fixture entries start on 2030-01-03, so January is not a full month.
    expect(actualLiving(base, '2030-01-25')).toBeNull()
    expect(actualLiving(base, '2030-02-10')).toBeNull()
  })

  it('averages spending (each purchase once) over the last 3 full months', () => {
    const wb: Workbook = {
      ...base,
      transactions: [...base.transactions, cash('f', '2030-02-05', 300000), cash('m', '2030-03-05', 600000), cash('a', '2030-04-05', 900000), cash('y', '2030-05-02', 50000)],
    }
    // Full months before May: Feb, Mar, Apr. 3,000 + 6,000 + 9,000 → 6,000 a month.
    expect(actualLiving(wb, '2030-05-10')).toEqual({ monthly: 600000, months: ['2030-02', '2030-03', '2030-04'] })
  })

  it('leaves out payments of loans, which the path counts as debt', () => {
    const wb: Workbook = {
      ...base,
      payables: [payable({ payableId: 'loan', times: 5 })],
      transactions: [...base.transactions, cash('f', '2030-02-05', 300000), cash('l', '2030-02-15', 200000, { payableId: 'loan', payableMonth: '2030-02' })],
    }
    expect(actualLiving(wb, '2030-03-10')).toEqual({ monthly: 300000, months: ['2030-02'] })
  })
})

describe('living costs in the payoff path', () => {
  const wb: Workbook = { ...base, payables: [payable({ payableId: 'elec' }), payable({ payableId: 'loan', times: 3, amount: 200000, row: 3 })] }

  it('replaces usual card spending and leaves out open-ended bills, but keeps loans', () => {
    const cards = payoffInput(wb, '2030-01-21', {}, 3)
    const living = payoffInput(wb, '2030-01-21', { living: 1000000 }, 3)
    expect(cards.months[0].nonCard).toBe(300000) // electric 1,000 + loan 2,000
    expect(living.months[0].nonCard).toBe(200000) // loan only: electric is in the living costs
    // February: living 10,000 less the 800 already logged on Alpha for the February bill.
    expect(living.months[1].cardEstimate).toBe(1000000 - 80000)
  })

  it('uses the actual path first, then the plan, then cards only', () => {
    expect(payoffPaths(base, '2030-01-21')).toMatchObject({ planned: null, actual: null })
    const withPlan: Workbook = { ...base, plannedExpenses: planned([1000000]) }
    const p = payoffPaths(withPlan, '2030-01-21')
    expect(p.planned?.living).toBe(1000000)
    expect(p.main).toBe(p.planned?.result)
    const withActual: Workbook = { ...withPlan, transactions: [...base.transactions, cash('f', '2030-02-05', 300000)] }
    const a = payoffPaths(withActual, '2030-03-10')
    expect(a.actual?.living.monthly).toBe(300000)
    expect(a.main).toBe(a.actual?.result)
  })
})
