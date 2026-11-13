import type { IsoDate } from '../domain/types'
import type { CellValue } from '../google/sheetsApi'
import { OPTIONAL_COLUMNS, OPTIONAL_TABS, SCHEMA_VERSION, TABS } from './schema'

/** Columns the app also writes, besides the ones it needs to read. */
const EXTRA_COLUMNS: Record<string, readonly string[]> = {
  Settings: ['note'],
  Payments: ['source', 'note'],
}

/** Starting categories of a new sheet. The user can change them in the Categories tab. */
export const STARTING_CATEGORIES = ['Food', 'Grocery', 'Transport', 'Utilities', 'Health', 'Shopping', 'Subscriptions', 'Other']

/** Header row of each tab of a new sheet: every fixed and optional tab, with every optional column. */
export function templateHeaders(): Record<string, string[]> {
  const headers: Record<string, string[]> = {}
  for (const [tab, columns] of [...Object.entries(TABS), ...Object.entries(OPTIONAL_TABS)]) {
    headers[tab] = [...new Set([...columns, ...(EXTRA_COLUMNS[tab] ?? []), ...(OPTIONAL_COLUMNS[tab] ?? [])])]
  }
  return headers
}

/** The tabs of a new sheet: headers, settings (with the name), starting categories, and a Cash account. */
export function templateTabs(name: string, today: IsoDate, createdAt: string): { title: string; rows: CellValue[][] }[] {
  const headers = templateHeaders()
  const row = (tab: string, values: Record<string, CellValue>) => headers[tab].map((h) => values[h] ?? '')
  const seed: Record<string, CellValue[][]> = {
    Settings: [row('Settings', { key: 'schema_version', value: SCHEMA_VERSION }), ...(name ? [row('Settings', { key: 'display_name', value: name })] : [])],
    Categories: STARTING_CATEGORIES.map((category) => row('Categories', { category })),
    Accounts: [
      row('Accounts', { account_id: 'cash', label: 'Cash', type: 'cash', opening_balance: 0, opening_date: today, is_savings: false, active: true, created_at: createdAt }),
    ],
  }
  return Object.entries(headers).map(([title, columns]) => ({ title, rows: [columns, ...(seed[title] ?? [])] }))
}
