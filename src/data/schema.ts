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

/** Headers for each card's statement tab (named in Cards.sheet_tab). txn_id is optional. */
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
