import { describe, expect, it } from 'vitest'
import { parseWorkbook } from '../data/workbook'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { nextStatementDate, readStatementBlock } from './statementPaste'
import type { Transaction, Workbook } from './types'

const base = parseWorkbook('Sample', fixtureTabs, fixtureValues)

const expense = (txnId: string, date: string, amount: number): Transaction => ({
  txnId,
  date,
  amount,
  merchant: `M ${txnId}`,
  category: 'Food',
  methodId: 'alpha',
  note: '',
})

const withExpenses = (...transactions: Transaction[]): Workbook => ({ ...base, transactions: [...base.transactions, ...transactions] })

describe('readStatementBlock', () => {
  it('reads each line, skips other text, and suggests the one matching expense', () => {
    const rows = readStatementBlock(base, 'alpha', 'Previous balance 8,000.00\n\n01/12 01/11 SAMPLE PHARMACY 800.00\n', '2030-02-10')
    expect(rows).toHaveLength(2)
    expect(rows[0].line).toBeNull()
    expect(rows[1].line).toMatchObject({ txnDate: '2030-01-11', amount: 80000, type: 'straight' })
    expect(rows[1].candidates.map((t) => t.txnId)).toEqual(['t3'])
    expect(rows[1].suggested).toBe('t3')
  })

  it('flags a line that is already in the sheet and does not suggest a match for it', () => {
    const [row] = readStatementBlock(base, 'alpha', '01/05 01/04 SAMPLE GROCER 2,500.25', '2030-01-10')
    expect(row.duplicate).toBe(true)
    expect(row.candidates).toEqual([])
  })

  it('finds a purchase already in the sheet even when the description and post date differ', () => {
    const [row] = readStatementBlock(base, 'alpha', 'Jan 04, 2030\nSAMPLE GROCER CITY PHL\n- PHP 2,500.25', '2030-01-10')
    expect(row.duplicate).toBe(true)
  })

  it('marks only one of two equal pasted lines when the sheet has the purchase once', () => {
    const rows = readStatementBlock(base, 'alpha', '01/05 01/04 SAMPLE GROCER 2,500.25\n01/05 01/04 SAMPLE GROCER 2,500.25', '2030-01-10')
    expect(rows.map((r) => r.duplicate)).toEqual([true, false])
  })

  it('lets the user pick when two expenses have the same amount', () => {
    const wb = withExpenses(expense('a', '2030-01-20', 50000), expense('b', '2030-01-21', 50000))
    const [row] = readStatementBlock(wb, 'alpha', '01/21 01/21 SAMPLE SHOP 500.00', '2030-02-10')
    expect(row.candidates.map((t) => t.txnId)).toEqual(['b', 'a'])
    expect(row.suggested).toBe('')
  })

  it('does not suggest the same expense for two pasted lines', () => {
    const wb = withExpenses(expense('a', '2030-01-20', 50000))
    const rows = readStatementBlock(wb, 'alpha', '01/20 01/20 SAMPLE SHOP 500.00\n01/21 01/21 SAMPLE SHOP 500.00', '2030-02-10')
    expect(rows.map((r) => r.suggested)).toEqual(['a', ''])
  })

  it('does not suggest a match for payments or installments', () => {
    const [row] = readStatementBlock(base, 'alpha', '01/12 01/11 PAYMENT THANK YOU 800.00C', '2030-02-10')
    expect(row.line?.type).toBe('payment')
    expect(row.candidates).toEqual([])
  })
})

describe('nextStatementDate', () => {
  it('is the cut-off after the latest statement in the sheet', () => {
    const alpha = base.cards.find((c) => c.cardId === 'alpha')!
    expect(nextStatementDate(base, alpha)).toBe('2030-02-10')
  })
})
