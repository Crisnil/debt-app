import type { Account, Card, Workbook } from './types'

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

export function accountLabel(wb: Pick<Workbook, 'accounts' | 'cards'>, id: string): string {
  return wb.accounts.find((a) => a.accountId === id)?.label ?? wb.cards.find((c) => c.cardId === id)?.name ?? id
}
