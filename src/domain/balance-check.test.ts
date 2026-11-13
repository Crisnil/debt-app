import { describe, expect, it } from 'vitest'
import { parseWorkbook } from '../data/workbook'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { accountBalances, accountsToCheck, checkResults, savedInMonth } from './balances'
import { NOT_RECORDED, spendingItems } from './reconcile'
import type { BalanceCheck, Workbook } from './types'

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)

let n = 0
const check = (accountId: string, date: string, balance: number, countDifference = true): BalanceCheck => ({
  checkId: `c${++n}`,
  createdAt: `2030-02-01T00:${String(n).padStart(4, '0')}Z`,
  date,
  accountId,
  balance,
  countDifference,
  note: '',
})
const withChecks = (...checks: BalanceCheck[]): Workbook => ({ ...base, balanceChecks: checks })
const balanceOf = (wb: Workbook, id: string) => accountBalances(wb).find((b) => b.account.accountId === id)!.balance

describe('balance check', () => {
  // Fixture cash: opening 200 on 01-01, cafe −150 on 01-12, +100 from Piggy on 01-16 → 150.
  it('starts the app balance again from the real balance', () => {
    expect(balanceOf(base, 'cash')).toBe(15000)
    const wb = withChecks(check('cash', '2030-01-13', 0))
    // Real 0 at the end of 01-13, then +100 on 01-16.
    expect(balanceOf(wb, 'cash')).toBe(10000)
  })

  it('counts money that went out without an entry as Not recorded spending', () => {
    const wb = withChecks(check('cash', '2030-01-13', 0))
    expect(checkResults(wb)).toEqual([expect.objectContaining({ expected: 5000, difference: -5000, notRecorded: 5000 })])
    expect(spendingItems(wb)).toContainEqual(
      expect.objectContaining({ date: '2030-01-13', amount: 5000, category: NOT_RECORDED, label: 'Balance check: Cash', methodId: 'cash', source: 'check', check: wb.balanceChecks[0] }),
    )
  })

  it('compares each check with the one before it', () => {
    const wb = withChecks(check('cash', '2030-01-13', 0), check('cash', '2030-01-20', 9000))
    const [latest, first] = checkResults(wb)
    expect(first).toMatchObject({ difference: -5000, notRecorded: 5000 })
    // 0 + 100 moved in = 100 expected; real 90.
    expect(latest).toMatchObject({ expected: 10000, difference: -1000, notRecorded: 1000 })
    expect(balanceOf(wb, 'cash')).toBe(9000)
  })

  it('does not count the difference of a new starting balance', () => {
    const wb = withChecks(check('cash', '2030-01-13', 0, false))
    expect(checkResults(wb)[0]).toMatchObject({ difference: -5000, notRecorded: 0 })
    expect(spendingItems(wb).some((i) => i.source === 'check')).toBe(false)
    expect(balanceOf(wb, 'cash')).toBe(10000)
  })

  it('updates a savings balance that is higher (interest) without counting it as saved or spending', () => {
    // Piggy: 5,000 + 300 − 100 = 5,200. The bank shows 5,210.
    const wb = withChecks(check('piggy', '2030-01-31', 521000))
    expect(balanceOf(wb, 'piggy')).toBe(521000)
    expect(checkResults(wb)[0]).toMatchObject({ difference: 1000, notRecorded: 0 })
    expect(savedInMonth(wb, '2030-01')).toBe(savedInMonth(base, '2030-01'))
    expect(spendingItems(wb)).toEqual(spendingItems(base))
  })

  it('counts an e-wallet drop like a bank: its purchases are logged as expenses', () => {
    const wallet = { ...base.accounts[2], accountId: 'wallet', label: 'Wallet', type: 'e-wallet' as const, openingBalance: 50000 }
    const wb: Workbook = { ...withChecks(check('wallet', '2030-01-20', 10000)), accounts: [...base.accounts, wallet] }
    expect(checkResults(wb)[0]).toMatchObject({ difference: -40000, notRecorded: 40000 })
    expect(balanceOf(wb, 'wallet')).toBe(10000)
  })

  it('uses the last one typed when two checks have the same date, and ignores checks before the opening date', () => {
    const wb = withChecks(check('cash', '2029-12-31', 999999), check('cash', '2030-01-13', 1000), check('cash', '2030-01-13', 0))
    expect(checkResults(wb)).toHaveLength(1)
    expect(balanceOf(wb, 'cash')).toBe(10000)
  })

  it('lists the accounts not checked this month', () => {
    const wb = withChecks(check('cash', '2030-01-13', 0), check('piggy', '2029-12-31', 0))
    expect(accountsToCheck(wb, '2030-01').map((a) => a.accountId)).toEqual(['payroll', 'piggy'])
  })
})
