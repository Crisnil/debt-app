/** Tabs and headers the app needs. Must match the sheet template (schema_version 2). */
export const SCHEMA_VERSION = 2

export const TABS = {
  Settings: ['key', 'value'],
  Cards: ['card_id', 'bank', 'name', 'sheet_tab', 'statement_day', 'due_day', 'monthly_rate', 'status'],
  CardSnapshots: ['card_id', 'as_of', 'due_date', 'outstanding_balance', 'current_due', 'minimum_due', 'interest_charged'],
  Payments: ['pay_id', 'date', 'card_id', 'amount', 'from_account'],
  Accounts: ['account_id', 'label', 'type', 'card_id', 'opening_balance', 'opening_date', 'is_savings', 'active'],
  Transfers: ['transfer_id', 'created_at', 'date', 'from_account', 'to_account', 'amount', 'note'],
  Income: ['source_id', 'label', 'amount', 'frequency', 'days', 'to_account', 'in_plan', 'active'],
  IncomeLog: ['income_id', 'created_at', 'date', 'source_id', 'type', 'amount', 'to_account', 'note'],
  Categories: ['category', 'weekly_budget', 'default_method'],
  Transactions: ['txn_id', 'created_at', 'date', 'amount', 'merchant', 'category', 'method_id', 'note', 'source'],
} as const

export type TabName = keyof typeof TABS

/** Tabs the app can add with Settings → Update sheet. The app works without them; their features stay off. */
export const OPTIONAL_TABS = {
  Payables: ['payable_id', 'created_at', 'name', 'payee', 'category', 'amount', 'recurring', 'due_day', 'start_month', 'times', 'active', 'note'],
  PayableAmounts: ['entry_id', 'payable_id', 'month', 'amount', 'created_at'],
  PlannedExpenses: ['item_id', 'name', 'amount', 'active', 'note'],
  BalanceChecks: ['check_id', 'created_at', 'date', 'account_id', 'balance', 'count_difference', 'note'],
} as const

export type OptionalTab = keyof typeof OPTIONAL_TABS

/** Columns the app can add at the end of an existing tab. */
export const OPTIONAL_COLUMNS: Record<string, readonly string[]> = {
  Cards: ['credit_limit'],
  Accounts: ['maintaining_balance', 'created_at'],
  Transactions: ['payable_id', 'payable_month', 'voided_at', 'void_reason'],
  Transfers: ['voided_at', 'void_reason'],
  IncomeLog: ['voided_at', 'void_reason'],
  Payments: ['created_at', 'voided_at', 'void_reason'],
  PlannedExpenses: ['payable_id'],
  Payables: ['card_id'],
  BalanceChecks: ['voided_at', 'void_reason'],
}

/** Columns the app can add at the end of each card's statement tab: the link to an expense, and void. */
export const STATEMENT_OPTIONAL_COLUMNS = ['txn_id', 'voided_at', 'void_reason'] as const

/** A tab to add (with its header row) or columns to add at the end of a tab's header row. */
export type SheetUpdate = { tab: string; create: boolean; columns: string[] }

/** What Update sheet would add: missing optional tabs, optional columns, and the optional columns of card statement tabs. */
export function sheetUpdates(availableTabs: readonly string[], headers: Record<string, string[]>, statementTabs: readonly string[]): SheetUpdate[] {
  const updates: SheetUpdate[] = []
  for (const [tab, columns] of Object.entries(OPTIONAL_TABS)) {
    if (!availableTabs.includes(tab)) updates.push({ tab, create: true, columns: [...columns, ...(OPTIONAL_COLUMNS[tab] ?? [])] })
  }
  const wanted: [string, readonly string[]][] = [...Object.entries(OPTIONAL_COLUMNS), ...statementTabs.map((t): [string, readonly string[]] => [t, STATEMENT_OPTIONAL_COLUMNS])]
  for (const [tab, columns] of wanted) {
    const have = headers[tab]
    if (!have) continue
    const missing = columns.filter((c) => !have.includes(c))
    if (missing.length) updates.push({ tab, create: false, columns: missing })
  }
  return updates
}

/** Headers for each card's statement tab (named in Cards.sheet_tab). STATEMENT_OPTIONAL_COLUMNS are optional. */
export const STATEMENT_TAB_HEADERS = [
  'statement_date',
  'post_date',
  'txn_date',
  'description',
  'type',
  'amount',
  'term_no',
  'total_terms',
  'category',
] as const

export type SchemaProblem = { tab: string; message: string }

export function checkHeaders(tab: string, headerRow: readonly unknown[] | undefined, required: readonly string[]): SchemaProblem[] {
  if (!headerRow || headerRow.length === 0) return [{ tab, message: `Tab "${tab}" has no header row.` }]
  const present = new Set(headerRow.map((h) => String(h).trim()))
  const missing = required.filter((h) => !present.has(h))
  return missing.length ? [{ tab, message: `Tab "${tab}" is missing column(s): ${missing.join(', ')}.` }] : []
}

export function checkTabs(available: readonly string[], needed: readonly string[]): SchemaProblem[] {
  const have = new Set(available)
  return needed.filter((t) => !have.has(t)).map((tab) => ({ tab, message: `Tab "${tab}" is missing.` }))
}
