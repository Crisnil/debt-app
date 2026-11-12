import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTabValues, updateCells } from '../google/sheetsApi'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { deleteExpense, saveExpense } from './actions'
import { parseWorkbook } from './workbook'

vi.mock('../google/sheetsApi', async (original) => ({
  ...(await original<typeof import('../google/sheetsApi')>()),
  getTabValues: vi.fn(),
  updateCells: vi.fn(async () => {}),
}))

const TXN_HEADER = [...(fixtureValues.Transactions[0] as string[]), 'deleted_at']
const withDeletedColumn = parseWorkbook('Sample', fixtureTabs, {
  ...fixtureValues,
  Transactions: [TXN_HEADER, ...fixtureValues.Transactions.slice(1).map((r) => [...r, ''])],
})
const cafe = withDeletedColumn.transactions.find((t) => t.txnId === 't1')!

describe('spending corrections in the sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getTabValues).mockResolvedValue({ Transactions: [TXN_HEADER, ...fixtureValues.Transactions.slice(1)] })
  })

  it('ignores a deleted expense', () => {
    const wb = parseWorkbook('Sample', fixtureTabs, {
      ...fixtureValues,
      Transactions: [TXN_HEADER, ['t1', '', '2030-01-12', 150, 'Sample Cafe', 'Food', 'cash', '', 'app', '2030-01-20T00:00:00Z']],
    })
    expect(wb.transactions).toEqual([])
  })

  it('writes the changed fields to the row of the expense', async () => {
    expect(cafe.row).toBe(2)
    await saveExpense('s', withDeletedColumn, cafe, { date: '2030-01-13', amount: 17550, merchant: '=Cafe', category: 'Food', methodId: 'cash', note: '' }, 'tok')
    expect(updateCells).toHaveBeenCalledWith(
      's',
      expect.arrayContaining([
        { range: "'Transactions'!C2", values: [['2030-01-13']] },
        { range: "'Transactions'!D2", values: [[175.5]] },
        { range: "'Transactions'!E2", values: [["'=Cafe"]] },
      ]),
      'tok',
    )
  })

  it('marks a deleted expense with deleted_at instead of removing the row', async () => {
    await deleteExpense('s', withDeletedColumn, cafe, 'tok')
    expect(updateCells).toHaveBeenCalledWith('s', [{ range: "'Transactions'!J2", values: [[expect.any(String)]] }], 'tok')
  })

  it('stops when the row holds another entry now', async () => {
    vi.mocked(getTabValues).mockResolvedValue({ Transactions: [TXN_HEADER, ['other', '', '2030-01-12']] })
    await expect(deleteExpense('s', withDeletedColumn, cafe, 'tok')).rejects.toThrow('The sheet changed. Reload the page and try again.')
    expect(updateCells).not.toHaveBeenCalled()
  })

  it('asks for Update sheet when deleted_at is missing', async () => {
    const old = parseWorkbook('Sample', fixtureTabs, fixtureValues)
    await expect(deleteExpense('s', old, old.transactions[0], 'tok')).rejects.toThrow('Open Settings → Update sheet first (adds "deleted_at" to Transactions).')
  })
})
