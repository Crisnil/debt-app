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

async function request<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
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
  for (const tab of tabs) params.append('ranges', `'${tab.replace(/'/g, "''")}'`)
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
