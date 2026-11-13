import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupSteps } from '../domain/setup'
import { addTabs, appendRows, createSpreadsheet, updateCells, type CellValue } from '../google/sheetsApi'
import { fixtureTabs, fixtureValues } from '../test/fixtures'
import { addCard, newStatementTab } from './actions'
import { STATEMENT_TAB_HEADERS } from './schema'
import { STARTING_CATEGORIES, templateTabs } from './template'
import { parseWorkbook } from './workbook'

const newSheet = (name = 'Ana') => {
  const tabs = templateTabs(name, '2030-01-21', '2030-01-21T09:00:00Z')
  return { tabs, wb: parseWorkbook('Debt App', tabs.map((t) => t.title), Object.fromEntries(tabs.map((t) => [t.title, t.rows]))) }
}

describe('a new sheet', () => {
  it('has every tab and column the app needs: nothing to update', () => {
    const { wb } = newSheet()
    expect(wb.updates).toEqual([])
    expect(wb.headers.Payables).toContain('card_id')
    expect(wb.headers.Transactions).toEqual(expect.arrayContaining(['voided_at', 'void_reason', 'payable_id']))
  })

  it('starts with the name, the categories, and a Cash account, and nothing else', () => {
    const { wb } = newSheet()
    expect(wb.settings.display_name?.value).toBe('Ana')
    expect(wb.categories.map((c) => c.category)).toEqual(STARTING_CATEGORIES)
    expect(wb.accounts.map((a) => [a.accountId, a.type, a.openingBalance])).toEqual([['cash', 'cash', 0]])
    expect(wb.cards).toEqual([])
    expect(newSheet('').wb.settings.display_name).toBeUndefined()
  })

  it('shows the first steps until they are done', () => {
    expect(setupSteps(newSheet().wb).filter((s) => s.done)).toEqual([])
    expect(setupSteps(parseWorkbook('Sample', fixtureTabs, fixtureValues)).every((s) => s.done)).toBe(true)
  })
})

describe('createSpreadsheet', () => {
  const calls: { url: string; body: unknown }[] = []
  beforeEach(() => {
    calls.length = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: { body: string }) => {
        calls.push({ url, body: JSON.parse(init.body) })
        return new Response(JSON.stringify({ spreadsheetId: 'new-id' }), { status: 200 })
      }),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('creates the sheet with its tabs, then writes the rows of each tab', async () => {
    const tabs = [
      { title: 'Settings', rows: [['key', 'value']] as CellValue[][] },
      { title: 'CC A', rows: [['statement_date']] as CellValue[][] },
    ]
    expect(await createSpreadsheet('Debt App', tabs, 'tok')).toBe('new-id')
    expect(calls[0]).toEqual({
      url: 'https://sheets.googleapis.com/v4/spreadsheets',
      body: { properties: { title: 'Debt App' }, sheets: tabs.map((t) => ({ properties: { title: t.title, gridProperties: { frozenRowCount: 1 } } })) },
    })
    expect(calls[1].url).toBe('https://sheets.googleapis.com/v4/spreadsheets/new-id/values:batchUpdate')
    expect(calls[1].body).toMatchObject({ data: [{ range: "'Settings'!A1", values: [['key', 'value']] }, { range: "'CC A'!A1", values: [['statement_date']] }] })
  })
})

vi.mock('../google/sheetsApi', async (original) => ({
  ...(await original<typeof import('../google/sheetsApi')>()),
  addTabs: vi.fn(async () => {}),
  updateCells: vi.fn(async () => {}),
  appendRows: vi.fn(async () => {}),
}))

describe('add a credit card', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adds its statement tab, its Cards row, and its Accounts row', async () => {
    const { wb } = newSheet()
    await addCard('s', wb, { name: 'BPI Credit', bank: 'BPI', statementDay: 10, dueDay: 30, creditLimit: 5000000, monthlyRate: 0.03 }, 'tok')
    expect(addTabs).toHaveBeenCalledWith('s', ['CC BPI Credit'], 'tok')
    expect(vi.mocked(updateCells).mock.calls[0][1]).toEqual([{ range: "'CC BPI Credit'!A1", values: [[...STATEMENT_TAB_HEADERS, 'txn_id', 'voided_at', 'void_reason']] }])
    const [cards, accounts] = vi.mocked(appendRows).mock.calls
    const asRecord = (tab: string, row: CellValue[]) => Object.fromEntries(wb.headers[tab].map((h, i) => [h, row[i]]))
    expect(cards[1]).toBe('Cards')
    expect(asRecord('Cards', cards[2][0])).toMatchObject({ card_id: 'bpi-credit', name: 'BPI Credit', sheet_tab: 'CC BPI Credit', statement_day: 10, due_day: 30, monthly_rate: 0.03, status: 'active', credit_limit: 50000 })
    expect(accounts[1]).toBe('Accounts')
    expect(asRecord('Accounts', accounts[2][0])).toMatchObject({ account_id: 'bpi-credit', label: 'BPI Credit', type: 'credit_card', card_id: 'bpi-credit', active: true })
  })

  it('does not reuse a tab name', () => {
    const wb = parseWorkbook('Sample', fixtureTabs, fixtureValues)
    expect(newStatementTab(wb, 'Alpha')).toBe('CC Alpha 2')
    expect(newStatementTab(wb, "Ana's: card")).toBe('CC Anas card')
  })
})
