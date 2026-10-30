import type { IncomeEntry, IncomeSource, IncomeType, IsoDate, LineType, Payment, StatementLine, Transaction, Transfer, Workbook } from '../domain/types'
import { appendRows, updateCells, type CellValue } from '../google/sheetsApi'
import { newId } from '../lib/ids'
import type { Centavos } from '../lib/money'
import { enqueue } from './outbox'
import { cellRange, pesos, toRow } from './rows'

const now = () => new Date().toISOString()

// ---- new rows (queued, work offline) ----------------------------------------

export type ExpenseInput = { date: IsoDate; amount: Centavos; merchant: string; category: string; methodId: string; note: string }

export function addExpense(sheetId: string, input: ExpenseInput): Transaction {
  const value: Transaction = { txnId: newId(), ...input }
  enqueue(sheetId, {
    key: value.txnId,
    tab: 'Transactions',
    record: {
      txn_id: value.txnId,
      created_at: now(),
      date: value.date,
      amount: pesos(value.amount),
      merchant: value.merchant,
      category: value.category,
      method_id: value.methodId,
      note: value.note,
      source: 'app',
    },
    entity: { kind: 'expense', value },
  })
  return value
}

export type TransferInput = { date: IsoDate; fromAccount: string; toAccount: string; amount: Centavos; note: string }

export function addTransfer(sheetId: string, input: TransferInput): Transfer {
  if (input.fromAccount === input.toAccount) throw new Error('Choose two different accounts.')
  const value: Transfer = { transferId: newId(), ...input }
  enqueue(sheetId, {
    key: value.transferId,
    tab: 'Transfers',
    record: {
      transfer_id: value.transferId,
      created_at: now(),
      date: value.date,
      from_account: value.fromAccount,
      to_account: value.toAccount,
      amount: pesos(value.amount),
      note: value.note,
    },
    entity: { kind: 'transfer', value },
  })
  return value
}

export type PaymentInput = { date: IsoDate; cardId: string; amount: Centavos; fromAccount: string; note: string }

export function addPayment(sheetId: string, input: PaymentInput): Payment {
  const value: Payment = { payId: newId(), date: input.date, cardId: input.cardId, amount: input.amount, fromAccount: input.fromAccount }
  enqueue(sheetId, {
    key: value.payId,
    tab: 'Payments',
    record: {
      pay_id: value.payId,
      created_at: now(),
      date: value.date,
      card_id: value.cardId,
      amount: pesos(value.amount),
      source: 'salary',
      from_account: value.fromAccount,
      note: input.note,
    },
    entity: { kind: 'payment', value },
  })
  return value
}

export type IncomeInput = { date: IsoDate; sourceId: string; type: IncomeType; amount: Centavos; toAccount: string; note: string }

export function addIncome(sheetId: string, input: IncomeInput): IncomeEntry {
  const value: IncomeEntry = { incomeId: newId(), ...input }
  enqueue(sheetId, {
    key: value.incomeId,
    tab: 'IncomeLog',
    record: {
      income_id: value.incomeId,
      created_at: now(),
      date: value.date,
      source_id: value.sourceId,
      type: value.type,
      amount: pesos(value.amount),
      to_account: value.toAccount,
      note: value.note,
    },
    entity: { kind: 'income', value },
  })
  return value
}

export type StatementLineInput = {
  statementDate: IsoDate
  postDate: IsoDate
  txnDate: IsoDate
  description: string
  type: LineType
  amount: Centavos
  termNo: number | null
  totalTerms: number | null
  category: string
}

export function addStatementLine(sheetId: string, wb: Workbook, cardId: string, input: StatementLineInput): StatementLine {
  const card = wb.cards.find((c) => c.cardId === cardId)
  if (!card?.sheetTab) throw new Error('This card has no statement tab in the sheet (Cards → sheet_tab).')
  const value: StatementLine = { cardId, row: 0, linkedTxnId: '', ...input }
  enqueue(sheetId, {
    key: newId(),
    tab: card.sheetTab,
    record: {
      statement_date: input.statementDate,
      post_date: input.postDate,
      txn_date: input.txnDate,
      description: input.description,
      type: input.type,
      amount: pesos(input.amount),
      term_no: input.termNo ?? '',
      total_terms: input.totalTerms ?? '',
      category: input.category,
    },
    entity: { kind: 'statementLine', value },
  })
  return value
}

// ---- edits (online only) ----------------------------------------------------

/** Links a statement line to an expense (or clears the link with ''). */
export async function linkStatementLine(sheetId: string, wb: Workbook, line: StatementLine, txnId: string, token: string) {
  const card = wb.cards.find((c) => c.cardId === line.cardId)
  const headers = card ? wb.headers[card.sheetTab] : undefined
  if (!card || !headers || line.row === 0) throw new Error('Save the statement line first, then link it.')
  if (!headers.includes('txn_id')) throw new Error(`Add a "txn_id" column to tab "${card.sheetTab}" to link lines by hand.`)
  await updateCells(sheetId, [{ range: cellRange(card.sheetTab, headers, 'txn_id', line.row), values: [[txnId]] }], token)
}

/** Sets Settings values by key. Adds a row for keys that are not in the sheet yet. */
export async function saveSettings(sheetId: string, wb: Workbook, values: Record<string, CellValue>, token: string) {
  const headers = wb.headers.Settings ?? ['key', 'value', 'note']
  const updates: { range: string; values: CellValue[][] }[] = []
  const newRows: CellValue[][] = []
  for (const [key, value] of Object.entries(values)) {
    const existing = wb.settings[key]
    if (existing) updates.push({ range: cellRange('Settings', headers, 'value', existing.row), values: [[value]] })
    else newRows.push(toRow(headers, { key, value }))
  }
  if (updates.length) await updateCells(sheetId, updates, token)
  if (newRows.length) await appendRows(sheetId, 'Settings', newRows, token)
}

export async function saveIncomeSource(
  sheetId: string,
  wb: Workbook,
  source: Pick<IncomeSource, 'row' | 'amount' | 'days' | 'active' | 'inPlan' | 'toAccount'>,
  token: string,
) {
  const h = wb.headers.Income
  const cell = (column: string, value: CellValue) => ({ range: cellRange('Income', h, column, source.row), values: [[value]] })
  await updateCells(
    sheetId,
    [
      cell('amount', pesos(source.amount)),
      cell('days', source.days.join(',')),
      cell('active', source.active),
      cell('in_plan', source.inPlan),
      cell('to_account', source.toAccount),
    ],
    token,
  )
}

export async function addIncomeSource(
  sheetId: string,
  wb: Workbook,
  source: Omit<IncomeSource, 'row'>,
  token: string,
) {
  const row = toRow(wb.headers.Income, {
    source_id: source.sourceId,
    label: source.label,
    amount: pesos(source.amount),
    frequency: source.frequency,
    days: source.days.join(','),
    to_account: source.toAccount,
    in_plan: source.inPlan,
    active: source.active,
  })
  await appendRows(sheetId, 'Income', [row], token)
}

export async function saveAccountOpening(sheetId: string, wb: Workbook, row: number, openingBalance: Centavos, openingDate: IsoDate, token: string) {
  const h = wb.headers.Accounts
  await updateCells(
    sheetId,
    [
      { range: cellRange('Accounts', h, 'opening_balance', row), values: [[pesos(openingBalance)]] },
      { range: cellRange('Accounts', h, 'opening_date', row), values: [[openingDate]] },
    ],
    token,
  )
}
