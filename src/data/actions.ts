import type { IncomeEntry, IncomeSource, IncomeType, IsoDate, LineType, Payable, PayableAmount, Payment, PlannedExpense, StatementLine, Transaction, Transfer, Workbook } from '../domain/types'
import { addTabs, appendRows, quoteTab, updateCells, type CellValue } from '../google/sheetsApi'
import { newId } from '../lib/ids'
import type { Centavos } from '../lib/money'
import { enqueue } from './outbox'
import { cellRange, columnLetter, pesos, safeText, toRow } from './rows'
import type { SheetUpdate } from './schema'

const now = () => new Date().toISOString()

// ---- new rows (queued, work offline) ----------------------------------------

export type ExpenseInput = { date: IsoDate; amount: Centavos; merchant: string; category: string; methodId: string; note: string; payableId?: string; payableMonth?: string }

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
      payable_id: value.payableId ?? '',
      // Apostrophe: keep "2026-11" as text, not a date.
      payable_month: value.payableMonth ? `'${value.payableMonth}` : '',
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
  /** Expense confirmed as the same purchase, or NO_MATCH. Saved in the txn_id column. */
  linkedTxnId?: string
}

export function addStatementLine(sheetId: string, wb: Workbook, cardId: string, input: StatementLineInput): StatementLine {
  const card = wb.cards.find((c) => c.cardId === cardId)
  if (!card?.sheetTab) throw new Error('This card has no statement tab in the sheet (Cards → sheet_tab).')
  const value: StatementLine = { cardId, row: 0, ...input, linkedTxnId: input.linkedTxnId ?? '' }
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
      txn_id: value.linkedTxnId,
    },
    entity: { kind: 'statementLine', value },
  })
  return value
}

export type PayableInput = Omit<Payable, 'payableId' | 'row' | 'active'>

export function addPayable(sheetId: string, input: PayableInput): Payable {
  const value: Payable = { payableId: newId(), ...input, active: true, row: 0 }
  enqueue(sheetId, {
    key: value.payableId,
    tab: 'Payables',
    record: {
      payable_id: value.payableId,
      created_at: now(),
      name: value.name,
      payee: value.payee,
      category: value.category,
      amount: pesos(value.amount),
      recurring: value.recurring,
      due_day: value.dueDay ?? '',
      start_month: `'${value.startMonth}`,
      times: value.times ?? '',
      active: true,
      note: value.note,
    },
    entity: { kind: 'payable', value },
  })
  return value
}

/** The real amount of a recurring payable for one month. The newest row for a month wins. */
export function setPayableAmount(sheetId: string, payableId: string, month: string, amount: Centavos): PayableAmount {
  const value: PayableAmount = { payableId, month, amount, createdAt: now() }
  const entryId = newId()
  enqueue(sheetId, {
    key: entryId,
    tab: 'PayableAmounts',
    record: { entry_id: entryId, payable_id: payableId, month: `'${month}`, amount: pesos(amount), created_at: value.createdAt },
    entity: { kind: 'payableAmount', value },
  })
  return value
}

/** A line of the planned monthly expenses. With a payable_id, the line is a bill from the Bills page. */
export function addPlannedExpense(sheetId: string, name: string, amount: Centavos, payableId = ''): PlannedExpense {
  const value: PlannedExpense = { itemId: newId(), name, amount, active: true, payableId, row: 0 }
  enqueue(sheetId, {
    key: value.itemId,
    tab: 'PlannedExpenses',
    record: { item_id: value.itemId, name, amount: pesos(amount), active: true, note: '', payable_id: payableId },
    entity: { kind: 'plannedExpense', value },
  })
  return value
}

// ---- edits (online only) ----------------------------------------------------

/** Changes a planned expense line, or removes it from the plan (active = false). */
export async function savePlannedExpense(sheetId: string, wb: Workbook, row: number, edit: { name: string; amount: Centavos; active: boolean }, token: string) {
  const h = wb.headers.PlannedExpenses
  const cell = (column: string, value: CellValue) => ({ range: cellRange('PlannedExpenses', h, column, row), values: [[value]] })
  await updateCells(sheetId, [cell('name', safeText(edit.name)), cell('amount', pesos(edit.amount)), cell('active', edit.active)], token)
}

/** Stops a payable: it no longer shows for new months. Months already paid stay. Its planned lines leave the plan too. */
export async function stopPayable(sheetId: string, wb: Workbook, row: number, token: string) {
  const payableId = wb.payables.find((p) => p.row === row)?.payableId
  const planned = payableId ? wb.plannedExpenses.filter((e) => e.active && e.payableId === payableId && e.row > 0) : []
  await updateCells(
    sheetId,
    [
      { range: cellRange('Payables', wb.headers.Payables, 'active', row), values: [[false]] },
      ...planned.map((e) => ({ range: cellRange('PlannedExpenses', wb.headers.PlannedExpenses, 'active', e.row), values: [[false]] })),
    ],
    token,
  )
}

export type PayableEdit = Pick<Payable, 'name' | 'payee' | 'category' | 'amount' | 'dueDay' | 'times'>

/** Changes a payable in place (its row in the Payables tab). */
export async function savePayable(sheetId: string, wb: Workbook, row: number, edit: PayableEdit, token: string) {
  const h = wb.headers.Payables
  const cell = (column: string, value: CellValue) => ({ range: cellRange('Payables', h, column, row), values: [[value]] })
  await updateCells(
    sheetId,
    [
      cell('name', safeText(edit.name)),
      cell('payee', safeText(edit.payee)),
      cell('category', safeText(edit.category)),
      cell('amount', pesos(edit.amount)),
      cell('due_day', edit.dueDay ?? ''),
      cell('times', edit.times ?? ''),
    ],
    token,
  )
}

/** Header cells to write for each update: from column A for a new tab, after the last header for an existing tab. */
export function sheetUpdateCells(headers: Record<string, string[]>, updates: SheetUpdate[]): { range: string; values: CellValue[][] }[] {
  return updates.map((u) => {
    const start = u.create ? 0 : (headers[u.tab]?.length ?? 0)
    return { range: `${quoteTab(u.tab)}!${columnLetter(start)}1:${columnLetter(start + u.columns.length - 1)}1`, values: [u.columns] }
  })
}

/** Adds missing tabs with their header row, and missing columns at the end of header rows. Never changes data rows. */
export async function applySheetUpdates(sheetId: string, wb: Workbook, updates: SheetUpdate[], token: string) {
  await addTabs(sheetId, updates.filter((u) => u.create).map((u) => u.tab), token)
  const cells = sheetUpdateCells(wb.headers, updates)
  if (cells.length) await updateCells(sheetId, cells, token)
}

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

/** Sets Cards.credit_limit for one card. */
export async function saveCreditLimit(sheetId: string, wb: Workbook, row: number, limit: Centavos, token: string) {
  const h = wb.headers.Cards
  if (!h.includes('credit_limit')) throw new Error('Add a column named "credit_limit" to the Cards tab first.')
  await updateCells(sheetId, [{ range: cellRange('Cards', h, 'credit_limit', row), values: [[pesos(limit)]] }], token)
}

export async function saveAccountOpening(
  sheetId: string,
  wb: Workbook,
  row: number,
  openingBalance: Centavos,
  openingDate: IsoDate,
  token: string,
  maintainingBalance?: Centavos,
) {
  const h = wb.headers.Accounts
  const updates = [
    { range: cellRange('Accounts', h, 'opening_balance', row), values: [[pesos(openingBalance)]] },
    { range: cellRange('Accounts', h, 'opening_date', row), values: [[openingDate]] },
  ]
  if (maintainingBalance !== undefined && h.includes('maintaining_balance')) {
    updates.push({ range: cellRange('Accounts', h, 'maintaining_balance', row), values: [[pesos(maintainingBalance)]] })
  }
  await updateCells(sheetId, updates, token)
}

export type NewAccount = { label: string; type: 'bank' | 'cash' | 'e-wallet'; isSavings: boolean; openingBalance: Centavos; openingDate: IsoDate; maintainingBalance: Centavos }

/** An id from the name that is not used yet: "BPI Savings" -> "bpi-savings" (or "bpi-savings-2"). */
export function newAccountId(wb: Pick<Workbook, 'accounts' | 'cards'>, label: string): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'account'
  const used = new Set([...wb.accounts.map((a) => a.accountId), ...wb.cards.map((c) => c.cardId)])
  let id = base
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`
  return id
}

/** Adds an account (bank, cash, or e-wallet) as a new row of the Accounts tab. */
export async function addAccount(sheetId: string, wb: Workbook, account: NewAccount, token: string) {
  const row = toRow(wb.headers.Accounts, {
    account_id: newAccountId(wb, account.label),
    label: account.label,
    type: account.type,
    card_id: '',
    opening_balance: pesos(account.openingBalance),
    opening_date: account.openingDate,
    is_savings: account.isSavings,
    active: true,
    maintaining_balance: account.maintainingBalance ? pesos(account.maintainingBalance) : '',
  })
  await appendRows(sheetId, 'Accounts', [row], token)
}
