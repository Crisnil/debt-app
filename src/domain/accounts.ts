import type { Account, AccountType, Card, Workbook } from './types'

/** What the app calls each account type. The sheet keeps "bank" for a debit account (payroll, savings, Maribank). */
export const TYPE_LABEL: Record<AccountType, string> = { bank: 'Debit', 'e-wallet': 'E-wallet', cash: 'Cash', credit_card: 'Credit' }

/** Money account types in the order they are listed: Debit, E-wallet, Cash. */
export const MONEY_GROUPS: AccountType[] = ['bank', 'e-wallet', 'cash']

/** Money accounts by group (Debit, E-wallet, Cash), each in sheet order. */
export function byGroup<T>(items: T[], typeOf: (item: T) => AccountType): T[] {
  const rank = (item: T) => MONEY_GROUPS.indexOf(typeOf(item))
  return items.map((item, i) => ({ item, i })).sort((a, b) => rank(a.item) - rank(b.item) || a.i - b.i).map((x) => x.item)
}

/**
 * Old way: loading GCash or Maya was the expense. Now a load is a Move money transfer and purchases are expenses
 * paid from the e-wallet. Kept for old entries and old cash-outs (IncomeLog ewallet_return).
 */
export const EWALLET_LOAD = 'E-wallet load'

/** The card an expense was charged to, or null when it was paid from cash, a bank, or an e-wallet. */
export function cardForMethod(wb: Pick<Workbook, 'accounts' | 'cards'>, methodId: string): Card | null {
  const account = wb.accounts.find((a) => a.accountId === methodId)
  const cardId = account?.type === 'credit_card' ? account.cardId || account.accountId : methodId
  return wb.cards.find((c) => c.cardId === cardId) ?? null
}

/** Accounts that hold money (not credit cards). */
export function moneyAccounts(wb: Pick<Workbook, 'accounts'>): Account[] {
  return wb.accounts.filter((a) => a.type !== 'credit_card')
}

/** "Paid from" choices for an expense: cards, banks, cash, and e-wallets. */
export function paidFromAccounts(wb: Pick<Workbook, 'accounts'>): Account[] {
  return wb.accounts.filter((a) => a.active)
}

/** Categories for an expense, from the Categories tab. */
export function expenseCategories(wb: Pick<Workbook, 'categories'>): string[] {
  return wb.categories.map((c) => c.category)
}

export function accountLabel(wb: Pick<Workbook, 'accounts' | 'cards'>, id: string): string {
  return wb.accounts.find((a) => a.accountId === id)?.label ?? wb.cards.find((c) => c.cardId === id)?.name ?? id
}
