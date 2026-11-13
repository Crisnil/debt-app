import { describe, expect, it } from 'vitest'
import { sheetUpdateCells } from '../data/actions'
import { sheetUpdates } from '../data/schema'
import { parseWorkbook } from '../data/workbook'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { billsByMonth, forecastCards, PAYABLES, withPayables } from './forecast'
import { cardCharges, dueDateIn, payableMonths, payableProgress, payablesByMonth, payablesOwed } from './payables'
import { spendingItems } from './reconcile'
import type { Payable, StatementLine, Transaction, Workbook } from './types'

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)

const payable = (over: Partial<Payable>): Payable => ({
  payableId: 'p',
  name: 'Sample bill',
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

const pay = (txnId: string, payableId: string, payableMonth: string, amount: number, methodId = 'cash'): Transaction => ({
  txnId,
  date: `${payableMonth}-10`,
  amount,
  merchant: 'Sample',
  category: 'Utilities',
  methodId,
  note: '',
  payableId,
  payableMonth,
})

const wbWith = (payables: Payable[], transactions: Transaction[] = [], payableAmounts: Workbook['payableAmounts'] = []): Workbook => ({
  ...base,
  payables,
  payableAmounts,
  transactions: [...base.transactions, ...transactions],
})

describe('payable months', () => {
  it('lists every month of a recurring payable, with the amount set for a month and what is paid', () => {
    const wb = wbWith(
      [payable({ payableId: 'elec' })],
      [pay('x1', 'elec', '2030-01', 100000), pay('x2', 'elec', '2030-02', 50000)],
      [{ payableId: 'elec', month: '2030-02', amount: 120000, createdAt: '' }, { payableId: 'elec', month: '2030-02', amount: 125000, createdAt: '' }],
    )
    const months = payableMonths(wb, '2030-03')
    expect(months.map((m) => [m.month, m.dueDate, m.amount, m.amountSet, m.paid, m.left])).toEqual([
      ['2030-01', '2030-01-20', 100000, false, 100000, 0],
      ['2030-02', '2030-02-20', 125000, true, 50000, 75000], // the newest amount set wins
      ['2030-03', '2030-03-20', 100000, false, 0, 100000],
    ])
  })

  it('stops after the number of times, and shows a one-time payable in its month only', () => {
    const wb = wbWith([payable({ payableId: 'loan', times: 2 }), payable({ payableId: 'once', recurring: false, startMonth: '2030-02', dueDay: 5 })])
    expect(payableMonths(wb, '2030-06').map((m) => `${m.payable.payableId} ${m.month}`)).toEqual(['loan 2030-01', 'once 2030-02', 'loan 2030-02'])
  })

  it('keeps only paid months of a stopped payable', () => {
    const wb = wbWith([payable({ payableId: 'old', active: false })], [pay('x1', 'old', '2030-01', 100000)])
    expect(payableMonths(wb, '2030-03').map((m) => m.month)).toEqual(['2030-01'])
  })

  it('uses the last day when the due day is after the end of the month, or not set', () => {
    expect(dueDateIn('2030-02', 31)).toBe('2030-02-28')
    expect(dueDateIn('2030-04', null)).toBe('2030-04-30')
  })
})

describe('payable totals', () => {
  it('counts paid times and what is left for a payable with an end', () => {
    const wb = wbWith([payable({ payableId: 'loan', times: 5, amount: 200000 })], [pay('x1', 'loan', '2030-01', 200000), pay('x2', 'loan', '2030-02', 200000)])
    expect(payableProgress(wb, wb.payables[0], '2030-02-15')).toMatchObject({ paidTimes: 2, times: 5, left: 600000 })
  })

  it('owes all later months of payables with an end, but open-ended bills only up to this month', () => {
    const wb = wbWith([payable({ payableId: 'loan', times: 3, amount: 200000 }), payable({ payableId: 'elec' })], [pay('x1', 'elec', '2030-01', 100000)])
    // loan: 3 × 2,000; electric: February only (January is paid)
    expect(payablesOwed(wb, '2030-02-15')).toBe(600000 + 100000)
  })

  it('puts late months in the first forecast month', () => {
    const wb = wbWith([payable({ payableId: 'elec' })])
    const byMonth = payablesByMonth(wb, '2030-03', 2)
    expect(byMonth.get('2030-03')?.map((m) => m.month)).toEqual(['2030-01', '2030-02', '2030-03'])
    expect(byMonth.get('2030-04')?.map((m) => m.month)).toEqual(['2030-04'])
  })

  it('adds payables to the monthly bills as their own series', () => {
    const wb = wbWith([payable({ payableId: 'elec', startMonth: '2030-01' })])
    const months = withPayables(billsByMonth(forecastCards(wb, '2030-01-21'), '2030-01-21'), wb)
    const jan = months[0].byCard.find((c) => c.cardId === PAYABLES)!
    expect(jan).toMatchObject({ committed: 100000, items: [{ label: 'Sample bill', amount: 100000 }] })
    expect(months[0].total).toBe(300000 + 100000)
  })
})

describe('spending', () => {
  it('counts a bill paid from an e-wallet as spending (a load is a transfer, not spending)', () => {
    const wb = wbWith([payable({ payableId: 'net' })], [pay('x1', 'net', '2030-01', 150000, 'gcash')])
    const withWallet = { ...wb, accounts: [...wb.accounts, { ...wb.accounts[0], accountId: 'gcash', label: 'GCash', type: 'e-wallet' as const }] }
    expect(spendingItems(withWallet).some((i) => i.amount === 150000)).toBe(true)
  })
})

describe('sheet updates', () => {
  it('lists the tabs and columns the sheet is missing', () => {
    expect(base.updates).toEqual([
      { tab: 'Payables', create: true, columns: expect.arrayContaining(['payable_id', 'times']) },
      { tab: 'PayableAmounts', create: true, columns: ['entry_id', 'payable_id', 'month', 'amount', 'created_at'] },
      { tab: 'PlannedExpenses', create: true, columns: ['item_id', 'name', 'amount', 'active', 'note', 'payable_id'] },
      { tab: 'BalanceChecks', create: true, columns: ['check_id', 'created_at', 'date', 'account_id', 'balance', 'count_difference', 'note', 'voided_at', 'void_reason'] },
      { tab: 'Accounts', create: false, columns: ['maintaining_balance', 'created_at'] },
      { tab: 'Transactions', create: false, columns: ['payable_id', 'payable_month', 'voided_at', 'void_reason'] },
      { tab: 'Transfers', create: false, columns: ['voided_at', 'void_reason'] },
      { tab: 'IncomeLog', create: false, columns: ['voided_at', 'void_reason'] },
      { tab: 'Payments', create: false, columns: ['voided_at', 'void_reason'] },
      { tab: 'CC Alpha', create: false, columns: ['voided_at', 'void_reason'] },
      { tab: 'CC Beta', create: false, columns: ['txn_id', 'voided_at', 'void_reason'] },
    ])
  })

  it('adds payable_id to a PlannedExpenses tab made before it', () => {
    const headers = { PlannedExpenses: ['item_id', 'name', 'amount', 'active', 'note'] }
    expect(sheetUpdates(['PlannedExpenses'], headers, [])).toContainEqual({ tab: 'PlannedExpenses', create: false, columns: ['payable_id'] })
  })

  it('writes header cells from column A for a new tab and after the last header for an existing tab', () => {
    const cells = sheetUpdateCells(base.headers, base.updates)
    expect(cells.map((c) => c.range)).toEqual(["'Payables'!A1:M1", "'PayableAmounts'!A1:E1", "'PlannedExpenses'!A1:F1", "'BalanceChecks'!A1:I1", "'Accounts'!I1:J1", "'Transactions'!J1:M1", "'Transfers'!H1:I1", "'IncomeLog'!I1:J1", "'Payments'!I1:J1", "'CC Alpha'!L1:M1", "'CC Beta'!K1:M1"])
  })

  it('reads payables once the tabs exist', () => {
    const wb = parseWorkbook('Sample', [...fixtureTabs, 'Payables', 'PayableAmounts'], {
      ...fixtureValues,
      Payables: [
        ['payable_id', 'created_at', 'name', 'payee', 'category', 'amount', 'recurring', 'due_day', 'start_month', 'times', 'active', 'note'],
        ['p1', '', 'Sample loan', 'Sample person', 'Debt repayment', 2000, true, 15, '2030-01-01', 5, true, ''],
      ],
      PayableAmounts: [['entry_id', 'payable_id', 'month', 'amount', 'created_at'], ['e1', 'p1', '2030-02', 2500, '']],
    })
    expect(wb.payables[0]).toMatchObject({ payableId: 'p1', amount: 200000, recurring: true, dueDay: 15, startMonth: '2030-01', times: 5, active: true, row: 2 })
    expect(wb.payableAmounts).toEqual([{ payableId: 'p1', month: '2030-02', amount: 250000, createdAt: '' }])
    // card_id (bills charged to a card) is added to an existing Payables tab.
    expect(wb.updates.map((u) => u.tab)).toEqual(['PlannedExpenses', 'BalanceChecks', 'Accounts', 'Transactions', 'Transfers', 'IncomeLog', 'Payments', 'Payables', 'CC Alpha', 'CC Beta'])
  })
})

describe('bills charged to a card', () => {
  const netflix = payable({ payableId: 'nf', name: 'Netflix', payee: 'NETFLIX', amount: 54900, cardId: 'alpha', dueDay: 5 })
  const wb: Workbook = { ...base, payables: [payable({}), netflix] }

  it('are not counted as owed, due, or in the monthly bills: the card bill has them', () => {
    const without: Workbook = { ...base, payables: [payable({})] }
    expect(payableMonths(wb, '2030-03').map((m) => m.payable.payableId)).not.toContain('nf')
    expect(payablesOwed(wb, '2030-01-21')).toBe(payablesOwed(without, '2030-01-21'))
    expect(withPayables(billsByMonth(forecastCards(wb, '2030-01-21'), '2030-01-21'), wb)[0].total).toBe(
      withPayables(billsByMonth(forecastCards(without, '2030-01-21'), '2030-01-21'), without)[0].total,
    )
  })

  it('finds the charge of the month on that card only, not payments', () => {
    const line = (cardId: string, txnDate: string, description: string, type: StatementLine['type'] = 'straight'): StatementLine => ({
      cardId, row: 9, statementDate: '2030-01-10', postDate: txnDate, txnDate, description, type, amount: type === 'payment' ? -54900 : 54900, termNo: null, totalTerms: null, category: '', linkedTxnId: '',
    })
    const lines = [line('beta', '2030-01-05', 'NETFLIX'), line('alpha', '2030-01-06', 'NETFLIX REFUND', 'payment'), line('alpha', '2029-12-05', 'Netflix.com')]
    const [c] = cardCharges({ ...wb, lines }, '2030-01-21')
    expect(c.charged).toBeNull()
    expect(c.last?.txnDate).toBe('2029-12-05')
    const [found] = cardCharges({ ...wb, lines: [...lines, line('alpha', '2030-01-05', 'NETFLIX.COM')] }, '2030-01-21')
    expect(found.charged?.txnDate).toBe('2030-01-05')
  })
})

