import { describe, expect, it } from 'vitest'
import { parseWorkbook } from '../data/workbook'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { EWALLET_LOAD, expenseCategories, paidFromAccounts } from './accounts'
import { accountBalances, savedInMonth, savingsGoal } from './balances'
import { billFor, nextBill } from './billing'
import { NO_MATCH, reconcileCard, spendingItems } from './reconcile'
import type { StatementLine, Transaction, Transfer, Workbook } from './types'

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)

function withData(extra: { transactions?: Transaction[]; lines?: StatementLine[] }): Workbook {
  return { ...base, transactions: [...base.transactions, ...(extra.transactions ?? [])], lines: [...base.lines, ...(extra.lines ?? [])] }
}

const expense = (txnId: string, date: string, amount: number, methodId = 'alpha'): Transaction => ({
  txnId,
  date,
  amount,
  merchant: `M ${txnId}`,
  category: 'Food',
  methodId,
  note: '',
})

const straight = (row: number, txnDate: string, amount: number, linkedTxnId = ''): StatementLine => ({
  cardId: 'alpha',
  row,
  statementDate: '2030-02-10',
  postDate: txnDate,
  txnDate,
  description: `LINE ${row}`,
  type: 'straight',
  amount,
  termNo: null,
  totalTerms: null,
  category: '',
  linkedTxnId,
})

describe('billFor', () => {
  const cutoff9due30 = { statementDay: 9, dueDay: 30 }
  const cutoff27due19 = { statementDay: 27, dueDay: 19 }
  const cutoff31due25 = { statementDay: 31, dueDay: 25 }

  it.each([
    [cutoff9due30, '2030-01-09', '2030-01-09', '2030-01-30'],
    [cutoff9due30, '2030-01-10', '2030-02-09', '2030-02-28'], // February has 28 days
    [cutoff27due19, '2030-01-20', '2030-01-27', '2030-02-19'],
    [cutoff27due19, '2030-12-28', '2031-01-27', '2031-02-19'],
    [cutoff31due25, '2030-02-15', '2030-02-28', '2030-03-25'],
  ])('%o: purchase %s goes on statement %s due %s', (card, date, statementDate, dueDate) => {
    expect(billFor(card, date)).toEqual({ statementDate, dueDate })
  })

  it('returns null without cut-off and due days', () => {
    expect(billFor({ statementDay: null, dueDay: 30 }, '2030-01-01')).toBeNull()
  })

  it('finds the next statement', () => {
    expect(nextBill(cutoff9due30, '2030-01-09')).toEqual({ statementDate: '2030-02-09', dueDate: '2030-02-28' })
  })
})

describe('reconcileCard', () => {
  it('matches the same card, amount, and a close date; counts the purchase once', () => {
    const r = reconcileCard(base, 'alpha')
    expect(r.matched.map((m) => [m.txn.txnId, m.how])).toEqual([['t2', 'auto']])
    expect(r.unlogged).toEqual([])
    // t3 (2030-01-11) is after the 2030-01-10 cut-off: next bill.
    expect(r.unbilled.map((t) => t.txnId)).toEqual(['t3'])
    expect(r.notOnStatement).toEqual([])
  })

  it('pairs repeated purchases of the same amount by the closest date', () => {
    const wb = withData({
      transactions: [expense('a', '2030-02-01', 50000), expense('b', '2030-02-05', 50000)],
      lines: [straight(20, '2030-02-06', 50000), straight(21, '2030-02-02', 50000)],
    })
    const pairs = reconcileCard(wb, 'alpha').matched.filter((m) => m.line.row >= 20)
    expect(pairs.map((m) => [m.line.row, m.txn.txnId])).toEqual([
      [21, 'a'],
      [20, 'b'],
    ])
  })

  it('does not match when the dates are more than 3 days apart', () => {
    const wb = withData({ transactions: [expense('far', '2030-02-01', 70000)], lines: [straight(22, '2030-02-05', 70000)] })
    const r = reconcileCard(wb, 'alpha')
    expect(r.unlogged.map((l) => l.row)).toEqual([22])
    // t3 (fixture) also lands on the 2030-02-10 statement and is not on it.
    expect(r.notOnStatement.map((t) => t.txnId).sort()).toEqual(['far', 't3'])
  })

  it('asks to confirm when the amount is within 1%', () => {
    const wb = withData({ transactions: [expense('gas', '2030-02-03', 100000)], lines: [straight(23, '2030-02-03', 100500)] })
    const r = reconcileCard(wb, 'alpha')
    expect(r.probable.map((p) => [p.line.row, p.txn.txnId])).toEqual([[23, 'gas']])
  })

  it('uses links made by hand, and NO_MATCH stops matching', () => {
    const wb = withData({
      transactions: [expense('x', '2030-02-01', 12300), expense('y', '2030-02-02', 45600)],
      lines: [straight(24, '2030-02-20', 99900, 'x'), straight(25, '2030-02-02', 45600, NO_MATCH)],
    })
    const r = reconcileCard(wb, 'alpha')
    expect(r.matched.find((m) => m.line.row === 24)).toMatchObject({ how: 'manual', txn: { txnId: 'x' } })
    expect(r.acknowledged.map((l) => l.row)).toEqual([25])
    expect(r.notOnStatement.map((t) => t.txnId).sort()).toEqual(['t3', 'y'])
  })

  it('does not warn about statement lines from before the first logged expense', () => {
    const wb = { ...base, transactions: [expense('late', '2030-03-01', 100)] }
    const r = reconcileCard(wb, 'alpha')
    expect(r.unlogged).toEqual([])
    expect(r.beforeTracking.map((l) => l.description)).toEqual(['SAMPLE GROCER'])
  })
})

describe('spendingItems', () => {
  it('counts each purchase once across expenses and statement lines', () => {
    const items = spendingItems(base)
    const grocer = items.filter((i) => i.amount === 250025)
    expect(grocer).toHaveLength(1)
    expect(grocer[0]).toMatchObject({ source: 'both', category: 'Grocery' })
    // beta fuel line (no expense) + cash cafe + unbilled pharmacy
    expect(items.map((i) => i.amount).sort((a, b) => a - b)).toEqual([15000, 80000, 120000, 250025])
  })
})

describe('e-wallets', () => {
  const wb: Workbook = {
    ...base,
    accounts: [...base.accounts, { ...base.accounts[0], accountId: 'gcash', label: 'GCash', type: 'e-wallet', isSavings: false, row: 99 }],
    incomeLog: [
      ...base.incomeLog,
      { incomeId: 'c1', date: '2030-01-20', sourceId: 'gcash', type: 'ewallet_return', amount: 20000, toAccount: 'payroll', note: '' },
    ],
  }

  const balance = (w: Workbook, id: string) => accountBalances(w).find((b) => b.account.accountId === id)!.balance

  it('offers e-wallets in "Paid from"', () => {
    expect(paidFromAccounts(wb).map((a) => a.accountId)).toEqual(['payroll', 'piggy', 'cash', 'alpha', 'beta', 'gcash'])
  })

  it('offers only the categories of the Categories tab', () => {
    expect(expenseCategories(wb)).toEqual(['Grocery', 'Gasoline', 'Food'])
  })

  it('still counts an old cash-out as less e-wallet spending and adds it to the bank balance', () => {
    expect(spendingItems(wb).find((i) => i.category === EWALLET_LOAD)).toMatchObject({ amount: -20000, date: '2030-01-20' })
    expect(balance(wb, 'payroll')).toBe(balance(base, 'payroll') + 20000)
  })

  it('a load is a transfer: not spending, and it adds to the e-wallet balance', () => {
    const load: Transfer = { transferId: 'load', date: '2030-01-21', fromAccount: 'payroll', toAccount: 'gcash', amount: 30000, note: '' }
    const loaded: Workbook = { ...wb, transfers: [...wb.transfers, load] }
    expect(spendingItems(loaded)).toEqual(spendingItems(wb))
    expect(balance(loaded, 'gcash')).toBe(balance(wb, 'gcash') + 30000)
    expect(balance(loaded, 'payroll')).toBe(balance(wb, 'payroll') - 30000)
  })

  it('counts an expense paid from an e-wallet as spending and takes it from the e-wallet balance', () => {
    const txn = { ...base.transactions[0], txnId: 'gc1', date: '2030-01-22', amount: 12000, merchant: 'Jollibee', category: 'Food', methodId: 'gcash', payableId: '', payableMonth: '' }
    const spent: Workbook = { ...wb, transactions: [...wb.transactions, txn] }
    expect(spendingItems(spent).find((i) => i.txn?.txnId === 'gc1')).toMatchObject({ amount: 12000, category: 'Food', methodId: 'gcash' })
    expect(balance(spent, 'gcash')).toBe(balance(wb, 'gcash') - 12000)
  })

  it('money from an e-wallet into savings counts as saved this month', () => {
    const save: Transfer = { transferId: 'sv', date: '2030-01-23', fromAccount: 'gcash', toAccount: 'piggy', amount: 5000, note: '' }
    expect(savedInMonth({ ...wb, transfers: [...wb.transfers, save] }, '2030-01')).toBe(savedInMonth(wb, '2030-01') + 5000)
  })
})

describe('accounts and savings', () => {
  it('computes balances from the opening balance and later entries only', () => {
    const balances = Object.fromEntries(accountBalances(base).map((b) => [b.account.accountId, b.balance]))
    // payroll: 1,000 + 20,000 income − 300 moved − 999 − 1,000.75 − 1,200 card payments
    expect(balances.payroll).toBe(100000 + 2000000 - 30000 - 99900 - 100075 - 120000)
    expect(balances.piggy).toBe(500000 + 30000 - 10000)
    expect(balances.cash).toBe(20000 + 10000 - 15000)
    expect(balances.alpha).toBeUndefined()
  })

  it('counts net money moved into savings in the month', () => {
    expect(savedInMonth(base, '2030-01')).toBe(30000 - 10000)
    expect(savedInMonth(base, '2029-12')).toBe(99900)
  })

  it('switches the savings goal at the change month', () => {
    expect(savingsGoal(base, '2030-02')).toBe(50000)
    expect(savingsGoal(base, '2030-03')).toBe(200000)
  })
})
