/** Tabs and headers the app needs. Must match the sheet template (schema_version 1). */
export const SCHEMA_VERSION = 1

export const TABS = {
  Settings: ['key', 'value'],
  Cards: ['card_id', 'bank', 'name', 'sheet_tab', 'statement_day', 'due_day', 'monthly_rate', 'status'],
  CardSnapshots: ['card_id', 'as_of', 'due_date', 'outstanding_balance', 'current_due', 'minimum_due', 'interest_charged'],
  Payments: ['date', 'card_id', 'amount'],
  PaymentMethods: ['method_id', 'label', 'type', 'active'],
  Categories: ['category', 'weekly_budget', 'default_method'],
  Transactions: ['txn_id', 'date', 'amount', 'merchant', 'category', 'method_id'],
} as const

/** Headers for each card's statement tab (named in Cards.sheet_tab). */
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
