import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newId } from '../lib/ids'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { addExpense, addStatementLine } from './actions'
import { clearOutbox, flushOutbox, mergeOutbox, readOutbox } from './outbox'
import { cellRange, columnLetter, safeText, toRow } from './rows'
import { parseWorkbook } from './workbook'

const SHEET = 'test-sheet'
const wb = parseWorkbook('Sample', fixtureTabs, fixtureValues)

describe('rows', () => {
  it('builds a row in the tab column order', () => {
    expect(toRow(['a', 'b', 'c'], { c: 3, a: 'x', z: 'ignored' })).toEqual(['x', '', 3])
  })

  it('keeps formula-like text as plain text', () => {
    expect(safeText('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`)
    expect(safeText('-5 promo')).toBe("'-5 promo")
    expect(safeText('Savemore')).toBe('Savemore')
  })

  it('makes A1 ranges', () => {
    expect(columnLetter(0)).toBe('A')
    expect(columnLetter(26)).toBe('AA')
    expect(cellRange('CC Alpha', ['x', 'txn_id'], 'txn_id', 7)).toBe("'CC Alpha'!B7")
    expect(() => cellRange('T', ['x'], 'missing', 2)).toThrow('Column "missing" is missing in tab "T".')
  })
})

describe('newId', () => {
  it('is 26 characters and sorts by time', () => {
    const zeros = () => new Uint8Array(16)
    const a = newId(1_000, zeros)
    const b = newId(2_000, zeros)
    expect(a).toHaveLength(26)
    expect(a < b).toBe(true)
    expect(newId()).not.toBe(newId())
  })
})

describe('outbox', () => {
  beforeEach(() => {
    localStorage.clear()
    clearOutbox(SHEET)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('queues an expense and shows it in the workbook before it is synced', () => {
    const t = addExpense(SHEET, { date: '2030-01-20', amount: 12345, merchant: 'Sample', category: 'Food', methodId: 'cash', note: '' })
    const items = readOutbox(SHEET)
    expect(items).toHaveLength(1)
    expect(items[0].record).toMatchObject({ txn_id: t.txnId, amount: 123.45, source: 'app' })
    expect(mergeOutbox(wb, items).transactions.at(-1)?.txnId).toBe(t.txnId)
    expect(wb.transactions.find((x) => x.txnId === t.txnId)).toBeUndefined()
  })

  it('queues a statement line on the card tab with a negative amount for payments', () => {
    addStatementLine(SHEET, wb, 'alpha', {
      statementDate: '2030-02-10',
      postDate: '2030-02-01',
      txnDate: '2030-02-01',
      description: 'PAYMENT',
      type: 'payment',
      amount: -50000,
      termNo: null,
      totalTerms: null,
      category: '',
    })
    expect(readOutbox(SHEET)[0]).toMatchObject({ tab: 'CC Alpha', record: { amount: -500, term_no: '' } })
  })

  it('adds only rows that are not in the sheet yet, then empties the outbox', async () => {
    const first = addExpense(SHEET, { date: '2030-01-20', amount: 100, merchant: 'A', category: 'Food', methodId: 'cash', note: '' })
    addExpense(SHEET, { date: '2030-01-21', amount: 200, merchant: '=B', category: 'Food', methodId: 'cash', note: '' })
    const headers = fixtureValues.Transactions[0] as string[]
    const calls: { url: string; body?: unknown }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
        if (url.includes(':batchGet')) {
          // The first expense already reached the sheet on an earlier try.
          return new Response(JSON.stringify({ valueRanges: [{ range: 'Transactions', values: [headers, [first.txnId, '', '2030-01-20', 1]] }] }))
        }
        return new Response('{}')
      }),
    )
    const left = await flushOutbox(SHEET, { Transactions: headers }, 'token')
    expect(left).toBe(0)
    expect(readOutbox(SHEET)).toEqual([])
    const append = calls.find((c) => c.url.includes(':append'))!
    const rows = (append.body as { values: unknown[][] }).values
    expect(rows).toHaveLength(1)
    expect(rows[0][headers.indexOf('merchant')]).toBe("'=B")
    expect(rows[0][headers.indexOf('amount')]).toBe(2)
  })

  it('keeps rows in the outbox when the sheet cannot be reached', async () => {
    addExpense(SHEET, { date: '2030-01-20', amount: 100, merchant: 'A', category: 'Food', methodId: 'cash', note: '' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    await expect(flushOutbox(SHEET, {}, 'token')).rejects.toThrow('Google Sheets error 500.')
    expect(readOutbox(SHEET)).toHaveLength(1)
  })
})
