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
  // Fixture cards: Alpha straight purchases 2,500.25 over 2 statements = 1,250.13; Beta 1,200 on 1 statement.
  const CARD = 125013 + 120000

  it('counts card spending from the statements right away, and cash after 7 days of entries', () => {
    // The only cash entry is on 2030-01-12: on the 15th that is 4 days, too few to scale.
    expect(actualLiving(base, '2030-01-15')).toEqual({ monthly: CARD, card: CARD, cash: null, cashBasis: null })
    // On the 25th: 150 in 14 days, scaled to 31 days = 332.14.
    expect(actualLiving(base, '2030-01-25')).toEqual({
      monthly: CARD + 33214,
      card: CARD,
      cash: 33214,
      cashBasis: { kind: 'partial', from: '2030-01-12', to: '2030-01-25' },
    })
  })

  it('averages cash over the last 3 full months once there are full months', () => {
    const wb: Workbook = {
      ...base,
      transactions: [...base.transactions, cash('f', '2030-02-05', 300000), cash('m', '2030-03-05', 600000), cash('a', '2030-04-05', 900000), cash('y', '2030-05-02', 50000)],
    }
    expect(actualLiving(wb, '2030-05-10')).toMatchObject({ cash: 600000, cashBasis: { kind: 'months', months: ['2030-02', '2030-03', '2030-04'] } })
  })

  it('does not add logged card expenses again (the statements cover them)', () => {
    const wb: Workbook = { ...base, transactions: [...base.transactions, cash('c', '2030-01-13', 999900, { methodId: 'alpha' })] }
    expect(actualLiving(wb, '2030-01-15')?.card).toBe(CARD)
    expect(actualLiving(wb, '2030-01-15')?.cash).toBeNull()
  })

  it('leaves out payments of loans, which the path counts as debt', () => {
    const wb: Workbook = {
      ...base,
      payables: [payable({ payableId: 'loan', times: 5 })],
      transactions: [...base.transactions, cash('f', '2030-02-05', 300000), cash('l', '2030-02-15', 200000, { payableId: 'loan', payableMonth: '2030-02' })],
    }
    expect(actualLiving(wb, '2030-03-10')).toMatchObject({ cash: 300000, cashBasis: { kind: 'months', months: ['2030-02'] } })
  })

  it('is null when there are no statements and no entries', () => {
    expect(actualLiving({ ...base, lines: [], transactions: [] }, '2030-01-25')).toBeNull()
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
    const empty: Workbook = { ...base, lines: [], transactions: [] }
    expect(payoffPaths(empty, '2030-01-21')).toMatchObject({ planned: null, actual: null })
    const withPlan: Workbook = { ...empty, plannedExpenses: planned([1000000]) }
    const p = payoffPaths(withPlan, '2030-01-21')
    expect(p.planned?.living).toBe(1000000)
    expect(p.main).toBe(p.planned?.result)
    const a = payoffPaths({ ...base, plannedExpenses: planned([1000000]) }, '2030-01-15')
    expect(a.actual?.living.monthly).toBe(125013 + 120000)
    expect(a.main).toBe(a.actual?.result)
  })
})
