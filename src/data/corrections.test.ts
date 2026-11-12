import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTabValues, updateCells } from '../google/sheetsApi'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { saveExpense, saveLine, voidExpense, voidLine } from './actions'
import { parseWorkbook } from './workbook'

vi.mock('../google/sheetsApi', async (original) => ({
  ...(await original<typeof import('../google/sheetsApi')>()),
  getTabValues: vi.fn(),
  updateCells: vi.fn(async () => {}),
}))

const VOID = ['voided_at', 'void_reason']
const TXN_HEADER = [...(fixtureValues.Transactions[0] as string[]), ...VOID]
const BETA_HEADER = [...(fixtureValues['CC Beta'][0] as string[]), ...VOID]
const txnRows = fixtureValues.Transactions.slice(1).map((r) => [...r, '', ''])
const betaRows = fixtureValues['CC Beta'].slice(1).map((r) => [...r, '', ''])
const wb = parseWorkbook('Sample', fixtureTabs, { ...fixtureValues, Transactions: [TXN_HEADER, ...txnRows], 'CC Beta': [BETA_HEADER, ...betaRows] })
const cafe = wb.transactions.find((t) => t.txnId === 't1')!
const fuel = wb.lines.find((l) => l.description === 'SAMPLE FUEL')!

describe('corrections and void in the sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getTabValues).mockResolvedValue({ Transactions: [TXN_HEADER, ...txnRows], 'CC Beta': [BETA_HEADER, ...betaRows] })
  })

  it('ignores voided expenses, statement lines, and balance checks', () => {
    const voided = parseWorkbook('Sample', [...fixtureTabs, 'BalanceChecks'], {
      ...fixtureValues,
      Transactions: [TXN_HEADER, ['t1', '', '2030-01-12', 150, 'Sample Cafe', 'Food', 'cash', '', 'app', '2030-01-20T00:00:00Z', 'Did not happen']],
      'CC Beta': [BETA_HEADER, [...betaRows[0].slice(0, -2), '2030-01-20T00:00:00Z', 'Entered by mistake']],
      BalanceChecks: [
        ['check_id', 'created_at', 'date', 'account_id', 'balance', 'count_difference', 'note', ...VOID],
        ['c1', '', '2030-01-13', 'cash', 0, true, '', '2030-01-20T00:00:00Z', 'Entered by mistake'],
      ],
    })
    expect(voided.transactions).toEqual([])
    expect(voided.lines.filter((l) => l.cardId === 'beta')).toEqual([])
    expect(voided.balanceChecks).toEqual([])
  })

  it('writes a corrected expense to its own row', async () => {
    expect(cafe.row).toBe(2)
    await saveExpense('s', wb, cafe, { date: '2030-01-13', amount: 17550, merchant: '=Cafe', category: 'Food', methodId: 'cash', note: '' }, 'tok')
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

  it('voids an expense with the time and the reason; the row stays', async () => {
    await voidExpense('s', wb, cafe, 'Did not happen', 'tok')
    expect(updateCells).toHaveBeenCalledWith(
      's',
      [
        { range: "'Transactions'!J2", values: [[expect.any(String)]] },
        { range: "'Transactions'!K2", values: [['Did not happen']] },
      ],
      'tok',
    )
  })

  it('corrects and voids a statement line in its card tab', async () => {
    await saveLine('s', wb, fuel, { amount: 125000, description: 'SAMPLE FUEL 2', category: 'Gasoline' }, 'tok')
    expect(updateCells).toHaveBeenCalledWith(
      's',
      [
        { range: "'CC Beta'!F2", values: [[1250]] },
        { range: "'CC Beta'!D2", values: [['SAMPLE FUEL 2']] },
        { range: "'CC Beta'!I2", values: [['Gasoline']] },
      ],
      'tok',
    )
    await voidLine('s', wb, fuel, 'Entered by mistake', 'tok')
    expect(updateCells).toHaveBeenLastCalledWith('s', [expect.objectContaining({ range: "'CC Beta'!K2" }), { range: "'CC Beta'!L2", values: [['Entered by mistake']] }], 'tok')
  })

  it('stops when the row holds another entry now', async () => {
    vi.mocked(getTabValues).mockResolvedValue({ Transactions: [TXN_HEADER, ['other', '', '2030-01-12']], 'CC Beta': [BETA_HEADER, ['', '', '', 'OTHER', 'straight', 5]] })
    await expect(voidExpense('s', wb, cafe, 'Did not happen', 'tok')).rejects.toThrow('The sheet changed. Reload the page and try again.')
    await expect(voidLine('s', wb, fuel, 'Did not happen', 'tok')).rejects.toThrow('The sheet changed. Reload the page and try again.')
    expect(updateCells).not.toHaveBeenCalled()
  })

  it('asks for Update sheet when the void columns are missing', async () => {
    const old = parseWorkbook('Sample', fixtureTabs, fixtureValues)
    await expect(voidExpense('s', old, old.transactions[0], 'Did not happen', 'tok')).rejects.toThrow(
      'Open Settings → Update sheet first (adds "voided_at" and "void_reason" to Transactions).',
    )
  })
})
