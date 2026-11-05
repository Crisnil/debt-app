import type { Account, Card, Workbook } from './types'

/** Loading GCash or Maya is the expense. What you buy with the e-wallet is not logged again. */
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

/** "Paid from" choices for an expense: cards, banks, and cash. Not e-wallets: their spending is counted when you load them. */
export function paidFromAccounts(wb: Pick<Workbook, 'accounts'>): Account[] {
  return wb.accounts.filter((a) => a.active && a.type !== 'e-wallet')
}

/** Categories for an expense. Adds "E-wallet load" when the Categories tab does not have it yet. */
export function expenseCategories(wb: Pick<Workbook, 'categories'>): string[] {
  const names = wb.categories.map((c) => c.category)
  return names.includes(EWALLET_LOAD) ? names : [...names, EWALLET_LOAD]
}

export function accountLabel(wb: Pick<Workbook, 'accounts' | 'cards'>, id: string): string {
  return wb.accounts.find((a) => a.accountId === id)?.label ?? wb.cards.find((c) => c.cardId === id)?.name ?? id
}
