import type { CellValue } from '../google/sheetsApi'
import { toCentavos, type Centavos } from '../lib/money'

export type Row = Record<string, CellValue | undefined>

/** Turns a tab (header row + data rows) into objects keyed by header. Skips empty rows. */
export function rowsToObjects(values: CellValue[][]): Row[] {
  const [header, ...rows] = values
  if (!header) return []
  const keys = header.map((h) => String(h).trim())
  return rows
    .filter((row) => row.some((cell) => cell !== '' && cell !== null && cell !== undefined))
    .map((row) => Object.fromEntries(keys.map((key, i) => [key, row[i]])))
}

export function text(value: CellValue | undefined): string {
  return value === undefined || value === null ? '' : String(value).trim()
}

export function money(value: CellValue | undefined): Centavos {
  const t = typeof value === 'number' ? value : text(value)
  return t === '' ? 0 : toCentavos(t)
}

export function int(value: CellValue | undefined): number | null {
  const t = text(value)
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

export function num(value: CellValue | undefined): number | null {
  const t = text(value)
  if (t === '') return null
  const n = Number(t.replace('%', '')) / (t.endsWith('%') ? 100 : 1)
  return Number.isFinite(n) ? n : null
}

export function bool(value: CellValue | undefined): boolean {
  return value === true || text(value).toUpperCase() === 'TRUE'
}

/**
 * Normalizes a date cell to YYYY-MM-DD. Accepts YYYY-MM-DD, M/D/YYYY, M/D/YY, and
 * Sheets serial day numbers. Returns '' when the cell is empty or not a date.
 */
export function isoDate(value: CellValue | undefined): string {
  if (typeof value === 'number') {
    const ms = Math.round((value - 25569) * 86400 * 1000) // Sheets epoch 1899-12-30
    return new Date(ms).toISOString().slice(0, 10)
  }
  const t = text(value)
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }
  return ''
}
