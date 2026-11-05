import { describe, expect, it } from 'vitest'
import { newAccountId } from '../data/actions'
import { parseWorkbook } from '../data/workbook'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { moneyParts, moneyTotals } from './home'
import { incomeByMonth, paydaysToRecord } from './payday'
import type { IncomeEntry, Workbook } from './types'

// Fixture: salary 20,000 on the 14th and 28th into Payroll; recorded on 2030-01-14.
const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)

const entry = (incomeId: string, date: string, amount: number, sourceId = 'salary'): IncomeEntry => ({ incomeId, date, sourceId, type: 'salary', amount, toAccount: 'payroll', note: '' })

describe('paydays to record', () => {
  it('shows a payday from the last two weeks that has no income entry', () => {
    expect(paydaysToRecord(base, '2030-01-15')).toEqual([])
    expect(paydaysToRecord(base, '2030-01-30').map((p) => [p.source.sourceId, p.date, p.amount])).toEqual([['salary', '2030-01-28', 2000000]])
  })

  it('counts an entry a few days early or late, and a skipped payday (0) as answered', () => {
    expect(paydaysToRecord({ ...base, incomeLog: [...base.incomeLog, entry('e', '2030-01-26', 1900000)] }, '2030-01-30')).toEqual([])
    expect(paydaysToRecord({ ...base, incomeLog: [...base.incomeLog, entry('s', '2030-01-28', 0)] }, '2030-01-30')).toEqual([])
  })

  it('uses one day a month for a monthly source', () => {
    const wb: Workbook = {
      ...base,
      incomeSources: [...base.incomeSources, { ...base.incomeSources[0], sourceId: 'allowance', label: 'Allowance', amount: 800000, frequency: 'monthly', days: [8], row: 3 }],
    }
    expect(paydaysToRecord(wb, '2030-02-09').map((p) => `${p.source.sourceId} ${p.date}`)).toEqual(['salary 2030-01-28', 'allowance 2030-02-08'])
  })

  it('lists income received by month, without skipped paydays', () => {
    const wb: Workbook = { ...base, incomeLog: [...base.incomeLog, entry('b', '2030-01-28', 2000000), entry('s', '2029-12-28', 0)] }
    const months = incomeByMonth(wb, 2, '2030-01-30')
    expect(months.map((m) => [m.month, m.total, m.entries.length])).toEqual([
      ['2030-01', 4000000, 2],
      ['2029-12', 0, 0],
    ])
  })
})

describe('what we have', () => {
  it('totals all accounts, savings accounts, and what is spendable above the maintaining balance', () => {
    const wb: Workbook = { ...base, accounts: base.accounts.map((a) => (a.accountId === 'payroll' ? { ...a, maintainingBalance: 50000 } : a)) }
    const parts = moneyParts(wb)
    expect(parts.map((p) => p.id).sort()).toEqual(['cash', 'payroll', 'piggy'])
    const payroll = parts.find((p) => p.id === 'payroll')!.amount
    const cash = parts.find((p) => p.id === 'cash')!.amount
    expect(moneyTotals(parts)).toEqual({ total: payroll + cash + 520000, savings: 520000, spendable: payroll - 50000 + cash })
  })

  it('makes an account id from the name that is not used yet', () => {
    expect(newAccountId(base, 'BPI Savings')).toBe('bpi-savings')
    expect(newAccountId(base, 'Payroll')).toBe('payroll-2')
    expect(newAccountId(base, 'Alpha')).toBe('alpha-2') // card ids are taken too
  })
})
