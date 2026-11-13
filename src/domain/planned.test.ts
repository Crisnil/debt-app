import { describe, expect, it } from 'vitest'
import { parseWorkbook } from '../data/workbook'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { actualLiving, billsNotInPlan, payoffInput, payoffPaths, plannedLineDone, plannedLiving, runPayoff } from './payoff'
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
  cardId: '',
  row: 2,
  ...over,
})

const planned = (amounts: number[]): Workbook['plannedExpenses'] => amounts.map((amount, i) => ({ itemId: `i${i}`, name: `Item ${i}`, amount, active: true, payableId: '', row: i + 2 }))

const fromBill = (payableId: string, amount: number): Workbook['plannedExpenses'][number] => ({ itemId: `b-${payableId}`, name: payableId, amount, active: true, payableId, row: 9 })

describe('planned living costs', () => {
  it('is the total of the active planned expense lines, or null when there are none', () => {
    expect(plannedLiving(base, '2030-01')).toBeNull()
    const wb: Workbook = { ...base, plannedExpenses: [...planned([500000, 169900]), { itemId: 'x', name: 'Old', amount: 99999, active: false, payableId: '', row: 9 }] }
    expect(plannedLiving(wb, '2030-01')).toBe(669900)
  })

  it('counts a line added from Bills only while the bill runs, and hides it after the last payment', () => {
    // Loan: 3 payments, Feb to Apr 2030. Electric: open-ended.
    const wb: Workbook = {
      ...base,
      payables: [payable({ payableId: 'loan', startMonth: '2030-02', times: 3, amount: 200000 }), payable({ payableId: 'elec', row: 3 })],
      plannedExpenses: [...planned([500000]), fromBill('loan', 200000), fromBill('elec', 100000)],
    }
    expect(['2030-01', '2030-02', '2030-04', '2030-05'].map((m) => plannedLiving(wb, m))).toEqual([600000, 800000, 800000, 600000])
    expect(plannedLineDone(wb, wb.plannedExpenses[1], '2030-04')).toBe(false)
    expect(plannedLineDone(wb, wb.plannedExpenses[1], '2030-05')).toBe(true)
    // A deleted bill leaves the plan right away.
    const stopped: Workbook = { ...wb, payables: wb.payables.map((p) => (p.payableId === 'elec' ? { ...p, active: false } : p)) }
    expect(plannedLiving(stopped, '2030-02')).toBe(700000)
    expect(plannedLineDone(stopped, wb.plannedExpenses[2], '2030-02')).toBe(true)
  })

  it('lists open-ended monthly bills that are not in the plan', () => {
    const wb: Workbook = {
      ...base,
      payables: [payable({ payableId: 'elec', name: 'Electric' }), payable({ payableId: 'water', name: 'Water', row: 3 }), payable({ payableId: 'loan', times: 3, row: 4 })],
      plannedExpenses: [fromBill('elec', 100000)],
    }
    expect(billsNotInPlan(wb).map((p) => p.name)).toEqual(['Water'])
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

  it('shows the monthly math: income − living − bills − installments − earlier − interest = saved (or short)', () => {
    for (const today of ['2030-01-21', '2030-02-10']) {
      for (const m of payoffPaths({ ...wb, plannedExpenses: planned([1000000]) }, today).planned!.result.months.slice(0, 6)) {
        expect(m.income - m.living - m.nonCard - m.installments - m.earlier - m.interest).toBe(m.saved - m.carried - m.unpaid)
      }
    }
    const short = runPayoff({ months: [{ month: '2030-01', cardKnown: 900000, statementLeft: 400000, cardEstimate: 0, installments: 100000, nonCard: 200000, nonCardDebt: 0, carriedIn: 0, carriedInterest: 0 }], income: 1000000, rate: 0.03, cut: 0 })
    expect(short.months[0]).toMatchObject({ income: 1000000, living: 400000, installments: 100000, earlier: 400000, carried: 100000, saved: 0 })
  })

  it('replaces usual card spending and leaves out open-ended bills, but keeps loans', () => {
    const cards = payoffInput(wb, '2030-01-21', {}, 3)
    const living = payoffInput(wb, '2030-01-21', { living: 1000000 }, 3)
    expect(cards.months[0].nonCard).toBe(300000) // electric 1,000 + loan 2,000
    expect(living.months[0].nonCard).toBe(200000) // loan only: electric is in the living costs
    // February: living 10,000 less the 800 already logged on Alpha for the February bill.
    expect(living.months[1].cardEstimate).toBe(1000000 - 80000)
  })

  it('Plan: a loan added from Bills counts once, as a living cost, and still sets the debt-free month', () => {
    const linked: Workbook = { ...wb, plannedExpenses: [...planned([1000000]), fromBill('loan', 200000)] }
    const p = payoffPaths(linked, '2030-01-21').planned!
    const jan = payoffInput(linked, '2030-01-21', { living: (m) => plannedLiving(linked, m) ?? 0, inLiving: new Set(['loan']) }, 3).months[0]
    expect(jan.nonCard).toBe(0) // loan is in the living costs, electric is not in the plan
    expect(jan.nonCardDebt).toBe(200000)
    expect(p.result.months[0].living).toBeGreaterThanOrEqual(1200000 - 80000)
    expect(p.result.debtFree! >= '2030-03').toBe(true)
  })

  it('Actual: a bill counts once, from the record of how it was paid; an unpaid bill adds nothing', () => {
    // Electric 1,000 paid in cash in Feb: in the cash average. Not added again as a bill.
    const paidCash: Workbook = { ...wb, transactions: [...base.transactions, cash('e', '2030-02-10', 100000, { payableId: 'elec', payableMonth: '2030-02', category: 'Utilities' })] }
    expect(actualLiving(paidCash, '2030-03-10')).toMatchObject({ cash: 100000 })
    const actual = payoffPaths(paidCash, '2030-03-10').actual!
    const input = payoffInput(paidCash, '2030-03-10', { living: actual.living.monthly }, 3)
    // Bills in the path are the same as with no electric at all: the loan only.
    const noElec: Workbook = { ...paidCash, payables: paidCash.payables.filter((p) => p.payableId !== 'elec') }
    expect(input.months.map((m) => m.nonCard)).toEqual(payoffInput(noElec, '2030-03-10', { living: actual.living.monthly }, 3).months.map((m) => m.nonCard))
    expect(input.months[0].nonCard).toBeGreaterThan(0)
    // Electric paid by card: it is on the statement, in the card part only. The logged card expense is not added.
    const paidCard: Workbook = { ...wb, transactions: [...base.transactions, cash('e', '2030-01-13', 100000, { methodId: 'alpha', payableId: 'elec', payableMonth: '2030-01' })] }
    expect(actualLiving(paidCard, '2030-01-15')).toEqual(actualLiving(wb, '2030-01-15'))
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
