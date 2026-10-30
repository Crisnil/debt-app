import type { CellValue } from '../google/sheetsApi'
import { quoteTab } from '../google/sheetsApi'

/**
 * Text that starts with = + - @ is a formula in Sheets (USER_ENTERED). A leading apostrophe
 * keeps it as plain text, so a merchant name can never run as a formula.
 */
export function safeText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value
}

/** Builds a row in the tab's own column order. Unknown headers get an empty cell. */
export function toRow(headers: readonly string[], record: Record<string, CellValue | null | undefined>): CellValue[] {
  return headers.map((h) => {
    const v = record[h]
    if (v === null || v === undefined) return ''
    return typeof v === 'string' ? safeText(v) : v
  })
}

export function columnLetter(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** A1 range for one cell, e.g. cellRange('Settings', ['key','value'], 'value', 5) -> 'Settings'!B5 */
export function cellRange(tab: string, headers: readonly string[], column: string, row: number): string {
  const index = headers.indexOf(column)
  if (index < 0) throw new Error(`Column "${column}" is missing in tab "${tab}".`)
  return `${quoteTab(tab)}!${columnLetter(index)}${row}`
}

/** Pesos with 2 decimals for the sheet (amounts are centavos inside the app). */
export function pesos(centavos: number): number {
  return Math.round(centavos) / 100
}
