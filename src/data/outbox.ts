import type { IncomeEntry, Payment, StatementLine, Transaction, Transfer, Workbook } from '../domain/types'
import { appendRows, getTabValues, type CellValue } from '../google/sheetsApi'
import { isoDate, rowsToObjects, text } from './cells'
import { toRow } from './rows'

/** A new row waiting to be added to the sheet. The record is keyed by the tab's headers. */
export type OutboxItem =
  | { key: string; tab: 'Transactions'; record: Record<string, CellValue>; entity: { kind: 'expense'; value: Transaction } }
  | { key: string; tab: 'Transfers'; record: Record<string, CellValue>; entity: { kind: 'transfer'; value: Transfer } }
  | { key: string; tab: 'Payments'; record: Record<string, CellValue>; entity: { kind: 'payment'; value: Payment } }
  | { key: string; tab: 'IncomeLog'; record: Record<string, CellValue>; entity: { kind: 'income'; value: IncomeEntry } }
  | { key: string; tab: string; record: Record<string, CellValue>; entity: { kind: 'statementLine'; value: StatementLine } }

/** Column that holds the unique key of each tab. Statement tabs have no ID column, so a content key is used. */
const ID_COLUMN: Record<string, string> = {
  Transactions: 'txn_id',
  Transfers: 'transfer_id',
  Payments: 'pay_id',
  IncomeLog: 'income_id',
}

export function statementLineKey(r: { statement_date?: unknown; post_date?: unknown; description?: unknown; amount?: unknown }): string {
  const date = (v: unknown) => isoDate(v as CellValue | undefined)
  return [date(r.statement_date), date(r.post_date), text(r.description as CellValue), Number(r.amount).toFixed(2)].join('|')
}

function rowKey(tab: string, row: Record<string, unknown>): string {
  const idColumn = ID_COLUMN[tab]
  return idColumn ? String(row[idColumn] ?? '').trim() : statementLineKey(row)
}

// ---- storage ---------------------------------------------------------------

const listeners = new Set<() => void>()
const storageKey = (sheetId: string) => `debt-app.outbox.${sheetId}`
const cache = new Map<string, OutboxItem[]>()

export function readOutbox(sheetId: string): OutboxItem[] {
  const cached = cache.get(sheetId)
  if (cached) return cached
  let items: OutboxItem[] = []
  try {
    items = JSON.parse(localStorage.getItem(storageKey(sheetId)) ?? '[]') as OutboxItem[]
  } catch {
    items = []
  }
  cache.set(sheetId, items)
  return items
}

function writeOutbox(sheetId: string, items: OutboxItem[]) {
  localStorage.setItem(storageKey(sheetId), JSON.stringify(items))
  cache.set(sheetId, items)
  listeners.forEach((l) => l())
}

export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function enqueue(sheetId: string, item: OutboxItem) {
  writeOutbox(sheetId, [...readOutbox(sheetId), item])
}

export function clearOutbox(sheetId: string) {
  writeOutbox(sheetId, [])
}

// ---- sync ------------------------------------------------------------------

let running: Promise<number> | null = null

/**
 * Adds waiting rows to the sheet. Before adding, it reads the tab and skips rows whose key is
 * already there (for example after a timeout where the first try did succeed).
 * Returns the number of rows still waiting.
 */
export function flushOutbox(sheetId: string, headers: Record<string, string[]>, token: string): Promise<number> {
  running ??= (async () => {
    try {
      const items = readOutbox(sheetId)
      if (items.length === 0) return 0
      const tabs = [...new Set(items.map((i) => i.tab))]
      const current = await getTabValues(sheetId, tabs, token)
      for (const tab of tabs) {
        const existing = new Set(rowsToObjects(current[tab] ?? []).map((r) => rowKey(tab, r)))
        const tabHeaders = headers[tab] ?? (current[tab]?.[0] ?? []).map((h) => text(h))
        const pending = readOutbox(sheetId).filter((i) => i.tab === tab)
        const toAdd = pending.filter((i) => !existing.has(rowKey(tab, i.record)))
        if (toAdd.length) await appendRows(sheetId, tab, toAdd.map((i) => toRow(tabHeaders, i.record)), token)
        const done = new Set(pending.map((i) => i.key))
        writeOutbox(sheetId, readOutbox(sheetId).filter((i) => !done.has(i.key)))
      }
      return readOutbox(sheetId).length
    } finally {
      running = null
    }
  })()
  return running
}

/** Shows waiting rows in the app right away, before they reach the sheet. */
export function mergeOutbox(workbook: Workbook, items: OutboxItem[]): Workbook {
  if (items.length === 0) return workbook
  const wb: Workbook = {
    ...workbook,
    transactions: [...workbook.transactions],
    transfers: [...workbook.transfers],
    payments: [...workbook.payments],
    incomeLog: [...workbook.incomeLog],
    lines: [...workbook.lines],
  }
  for (const { entity } of items) {
    if (entity.kind === 'expense') wb.transactions.push(entity.value)
    else if (entity.kind === 'transfer') wb.transfers.push(entity.value)
    else if (entity.kind === 'payment') wb.payments.push(entity.value)
    else if (entity.kind === 'income') wb.incomeLog.push(entity.value)
    else wb.lines.push(entity.value)
  }
  return wb
}
