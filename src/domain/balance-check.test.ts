import { describe, expect, it } from 'vitest'
import { parseWorkbook } from '../data/workbook'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { accountBalances, accountsToCheck, checkResults, savedInMonth } from './balances'
import { NOT_RECORDED, spendingItems } from './reconcile'
import type { CellValue } from '../google/sheetsApi'
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

describe('entries on the same day as a balance check or the opening balance', () => {
  const move = (id: string, createdAt: string, amount = 50000) => ({ transferId: id, date: '2030-01-20', fromAccount: 'payroll', toAccount: 'cash', amount, note: '', createdAt })
  const at = (time: string) => ({ ...check('cash', '2030-01-20', 10000), createdAt: `2030-01-20T${time}Z` })

  it('counts a move typed after a same-day check, and not one typed before it', () => {
    const wb: Workbook = { ...withChecks(at('10:00:00')), transfers: [...base.transfers, move('before', '2030-01-20T09:00:00Z', 20000), move('after', '2030-01-20T11:00:00Z')] }
    // Real ₱100 at 10:00 (includes the 09:00 move), then +₱500 at 11:00.
    expect(balanceOf(wb, 'cash')).toBe(60000)
    // The check compares with entries up to it only: the 09:00 move is in what the app expected, the 11:00 one is not.
    expect(checkResults(wb)[0].expected).toBe(balanceOf(base, 'cash') + 20000)
  })

  it('does not count a same-day entry without a time (old rows): the typed balance includes it', () => {
    const wb: Workbook = { ...withChecks(at('10:00:00')), transfers: [...base.transfers, move('old', '')] }
    expect(balanceOf(wb, 'cash')).toBe(10000)
  })

  it('counts moves typed after a new account was added on the same day', () => {
    const bpi = { ...base.accounts[0], accountId: 'bpi', label: 'BPI', openingBalance: 105194, openingDate: '2030-01-20', createdAt: '2030-01-20T08:00:00Z', row: 99 }
    const toBpi = { transferId: 'b1', date: '2030-01-20', fromAccount: 'payroll', toAccount: 'bpi', amount: 600000, note: '', createdAt: '2030-01-20T09:00:00Z' }
    const wb: Workbook = { ...base, accounts: [...base.accounts, bpi], transfers: [...base.transfers, toBpi] }
    expect(balanceOf(wb, 'bpi')).toBe(705194)
    // Without the time the account was added (old rows), the opening balance is taken to include it.
    expect(balanceOf({ ...wb, accounts: [...base.accounts, { ...bpi, createdAt: '' }] }, 'bpi')).toBe(105194)
  })
})

describe('voided entries', () => {
  it('ignores voided moves, money in, and card payments in the sheet', () => {
    const voided = (rows: CellValue[][], extra: CellValue[]) => [[...rows[0], 'voided_at', 'void_reason'], ...rows.slice(1).map((r, i) => [...r, ...(i === 0 ? extra : ['', ''])])]
    const wb = parseWorkbook('Sample', fixtureTabs, {
      ...fixtureValues,
      Transfers: voided(fixtureValues.Transfers, ['2030-01-21T00:00:00Z', 'Entered twice']),
      IncomeLog: voided(fixtureValues.IncomeLog, ['2030-01-21T00:00:00Z', 'Did not happen']),
      Payments: voided(fixtureValues.Payments, ['2030-01-21T00:00:00Z', 'Entered by mistake']),
    })
    expect(wb.transfers.map((t) => t.transferId)).toEqual(['tr2', 'tr3'])
    expect(wb.incomeLog).toHaveLength(0)
    expect(wb.payments.map((p) => p.payId)).toEqual(['p2', 'p3'])
    // tr1 moved ₱300 from Payroll to Piggy Bank: both balances go back.
    expect(balanceOf(wb, 'piggy')).toBe(balanceOf(base, 'piggy') - 30000)
  })
})

