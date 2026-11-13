import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateCells } from '../google/sheetsApi'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { addTransfer, saveEntry, undoEntry } from './actions'
import { clearOutbox, discard, readOutbox } from './outbox'
import { parseWorkbook } from './workbook'

vi.mock('../google/sheetsApi', async (original) => ({
  ...(await original<typeof import('../google/sheetsApi')>()),
  getTabValues: vi.fn(async (_id: string, tabs: string[]) => Object.fromEntries(tabs.map((t) => [t, withVoid[t as keyof typeof withVoid] ?? []]))),
  updateCells: vi.fn(async () => {}),
}))

const voidColumns = (rows: (typeof fixtureValues)['Transfers']) => [[...rows[0], 'voided_at', 'void_reason'], ...rows.slice(1)]
const withVoid = {
  ...fixtureValues,
  Transfers: voidColumns(fixtureValues.Transfers),
  IncomeLog: voidColumns(fixtureValues.IncomeLog),
  Payments: voidColumns(fixtureValues.Payments),
  Transactions: voidColumns(fixtureValues.Transactions),
}
const wb = parseWorkbook('Sample', fixtureTabs, withVoid)
const ranges = () => vi.mocked(updateCells).mock.calls[0][1].map((c) => [c.range, c.values[0][0]])

describe('correct a move, money in, or card payment', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes date, amount, from, to, and note of a move', async () => {
    await saveEntry('s', wb, { tab: 'Transfers', id: 'tr2', row: 3 }, { date: '2030-01-17', amount: 15000, fromAccount: 'payroll', toAccount: 'cash', note: 'ATM' }, 'tok')
    expect(ranges()).toEqual([
      ["'Transfers'!C3", '2030-01-17'],
      ["'Transfers'!F3", 150],
      ["'Transfers'!D3", 'payroll'],
      ["'Transfers'!E3", 'cash'],
      ["'Transfers'!G3", 'ATM'],
    ])
  })

  it('writes Paid from of a card payment, and no to or note', async () => {
    await saveEntry('s', wb, { tab: 'Payments', id: 'p3', row: 4 }, { date: '2030-01-20', amount: 120000, fromAccount: 'piggy', toAccount: 'beta', note: '' }, 'tok')
    expect(ranges().map(([r]) => r)).toEqual(["'Payments'!B4", "'Payments'!D4", "'Payments'!G4"])
  })

  it('stops when the row no longer holds the entry', async () => {
    await expect(saveEntry('s', wb, { tab: 'Transfers', id: 'tr2', row: 2 }, { date: '2030-01-17', amount: 1, fromAccount: 'a', toAccount: 'b', note: '' }, 'tok')).rejects.toThrow(
      'The sheet changed',
    )
    expect(updateCells).not.toHaveBeenCalled()
  })
})

describe('undo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearOutbox('u')
  })

  it('takes back an entry still waiting on this phone', () => {
    const move = addTransfer('u', { date: '2030-01-21', fromAccount: 'payroll', toAccount: 'cash', amount: 5000, note: '' })
    expect(discard('u', move.transferId)).toBe(true)
    expect(readOutbox('u')).toHaveLength(0)
    expect(discard('u', move.transferId)).toBe(false)
  })

  it('voids an entry already in the sheet as entered by mistake', async () => {
    await undoEntry('s', wb, { tab: 'Transfers', id: 'tr2' }, 'tok')
    expect(ranges()).toEqual([
      ["'Transfers'!H3", expect.any(String)],
      ["'Transfers'!I3", 'Entered by mistake'],
    ])
  })

  it('asks to try again when the entry is not loaded from the sheet yet', async () => {
    await expect(undoEntry('s', wb, { tab: 'Payments', id: 'new' }, 'tok')).rejects.toThrow('Try Undo again in a moment.')
  })
})
