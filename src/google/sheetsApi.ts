import { AuthError, clearToken } from './auth'

const API = 'https://sheets.googleapis.com/v4/spreadsheets'

export type CellValue = string | number | boolean
export type SheetMeta = { title: string; tabs: string[] }
export type TabValues = Record<string, CellValue[][]>

export class SheetError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(url: string, token: string, init?: { method: 'POST' | 'PUT'; body: unknown }): Promise<T> {
  const response = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(init ? { 'Content-Type': 'application/json' } : {}) },
    body: init ? JSON.stringify(init.body) : undefined,
  })
  if (response.status === 401) {
    clearToken()
    throw new AuthError('Your Google sign-in expired. Sign in again.')
  }
  if (response.status === 403 || response.status === 404) {
    throw new SheetError('The app cannot open this sheet. Select it again in Settings.', response.status)
  }
  if (!response.ok) {
    throw new SheetError(`Google Sheets error ${response.status}.`, response.status)
  }
  return response.json() as Promise<T>
}

export function quoteTab(tab: string): string {
  return `'${tab.replace(/'/g, "''")}'`
}

export async function getSheetMeta(sheetId: string, token: string): Promise<SheetMeta> {
  const data = await request<{ properties: { title: string }; sheets: { properties: { title: string } }[] }>(
    `${API}/${encodeURIComponent(sheetId)}?fields=properties.title,sheets.properties.title`,
    token,
  )
  return { title: data.properties.title, tabs: data.sheets.map((s) => s.properties.title) }
}

/** Reads whole tabs in one request. Dates come back as the text shown in the sheet. */
export function batchGetUrl(sheetId: string, tabs: string[]): string {
  const params = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING' })
  for (const tab of tabs) params.append('ranges', quoteTab(tab))
  return `${API}/${encodeURIComponent(sheetId)}/values:batchGet?${params}`
}

export async function getTabValues(sheetId: string, tabs: string[], token: string): Promise<TabValues> {
  const data = await request<{ valueRanges: { range: string; values?: CellValue[][] }[] }>(batchGetUrl(sheetId, tabs), token)
  const result: TabValues = {}
  data.valueRanges.forEach((range, i) => {
    result[tabs[i]] = range.values ?? []
  })
  return result
}

/**
 * Appends rows after the last row of a tab. USER_ENTERED lets Sheets turn "2026-10-30" into a date
 * and numbers into numbers, the same as typing them in.
 */
export async function appendRows(sheetId: string, tab: string, rows: CellValue[][], token: string): Promise<void> {
  const params = new URLSearchParams({ valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS' })
  await request(`${API}/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(quoteTab(tab))}:append?${params}`, token, {
    method: 'POST',
    body: { values: rows },
  })
}

/** Writes several single cells or ranges in one request. Range example: 'Settings'!B5 */
export async function updateCells(sheetId: string, updates: { range: string; values: CellValue[][] }[], token: string): Promise<void> {
  await request(`${API}/${encodeURIComponent(sheetId)}/values:batchUpdate`, token, {
    method: 'POST',
    body: { valueInputOption: 'USER_ENTERED', data: updates },
  })
}
