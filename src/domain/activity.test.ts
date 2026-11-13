import { describe, expect, it } from 'vitest'
import { parseWorkbook } from '../data/workbook'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { entries, entryAccounts, filterEntries, totalsByKind } from './activity'
import { spendingItems } from './reconcile'
import type { Workbook } from './types'

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)

describe('transactions list', () => {
  it('has every purchase once, plus money in, moves, and card payments', () => {
    const list = entries(base)
    expect(list.filter((e) => e.kind === 'purchase')).toHaveLength(spendingItems(base).length)
    expect(list.filter((e) => e.kind === 'in').map((e) => [e.label, e.to, e.amount])).toEqual([['Salary', 'payroll', 2000000]])
    expect(list.filter((e) => e.kind === 'move').map((e) => e.label)).toEqual(['Piggy Bank → Cash', 'Payroll → Piggy Bank', 'Payroll → Piggy Bank'])
    expect(list.filter((e) => e.kind === 'payment').map((e) => [e.label, e.from])).toContainEqual(['Beta payment', 'payroll'])
  })

  it('leaves out skipped paydays, and keeps an old e-wallet cash-out as less spending (not money in)', () => {
    const wb: Workbook = {
      ...base,
      incomeLog: [
        ...base.incomeLog,
        { incomeId: 'skip', date: '2030-01-28', sourceId: 'salary', type: 'salary', amount: 0, toAccount: 'payroll', note: 'Skipped: did not arrive' },
        { incomeId: 'co', date: '2030-01-20', sourceId: 'gcash', type: 'ewallet_return', amount: 20000, toAccount: 'payroll', note: '' },
        { incomeId: 'gift', date: '2030-01-21', sourceId: 'mom', type: 'gift', amount: 50000, toAccount: 'cash', note: 'Birthday' },
      ],
    }
    const list = entries(wb)
    expect(list.filter((e) => e.kind === 'in').map((e) => e.label)).toEqual(['Gift', 'Salary'])
    expect(list.find((e) => e.kind === 'purchase' && e.amount === -20000)).toBeDefined()
  })

  it('filters by account on either side, and totals each kind', () => {
    const jan = filterEntries(entries(base), { month: '2030-01', kind: '', accountId: 'piggy', category: '' })
    expect(jan.map((e) => e.label)).toEqual(['Piggy Bank → Cash', 'Payroll → Piggy Bank'])
    expect(totalsByKind(jan)).toEqual({ purchase: 0, in: 0, move: 40000, payment: 0 })
    const accounts = entryAccounts(base, entries(base)).map((o) => o.value)
    expect(accounts).toContain('piggy')
    expect(accounts).not.toContain('salary')
  })
})
