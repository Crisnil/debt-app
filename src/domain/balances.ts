import type { Centavos } from '../lib/money'
import { moneyAccounts } from './accounts'
import type { Account, IsoDate, Workbook } from './types'

export type AccountBalance = { account: Account; balance: Centavos }

/**
 * Balance = opening balance + money in − money out, counting only entries after the opening date.
 * Money in: income, transfers in. Money out: expenses paid from the account, transfers out, card payments.
 */
export function accountBalances(wb: Workbook): AccountBalance[] {
  return moneyAccounts(wb)
    .filter((a) => a.active)
    .map((account) => {
      const id = account.accountId
      const after = (date: IsoDate) => !account.openingDate || date > account.openingDate
      let balance = account.openingBalance
      for (const i of wb.incomeLog) if (i.toAccount === id && after(i.date)) balance += i.amount
      for (const t of wb.transfers) {
        if (!after(t.date)) continue
        if (t.toAccount === id) balance += t.amount
        if (t.fromAccount === id) balance -= t.amount
      }
      for (const e of wb.transactions) if (e.methodId === id && after(e.date)) balance -= e.amount
      for (const p of wb.payments) if (p.fromAccount === id && after(p.date)) balance -= p.amount
      return { account, balance }
    })
}

/** Net money moved into savings accounts in a month (YYYY-MM). Moves between two savings accounts do not count. */
export function savedInMonth(wb: Workbook, month: string): Centavos {
  const savings = new Set(wb.accounts.filter((a) => a.isSavings).map((a) => a.accountId))
  return wb.transfers
    .filter((t) => t.date.startsWith(month))
    .reduce((sum, t) => {
      const into = savings.has(t.toAccount)
      const outOf = savings.has(t.fromAccount)
      if (into && !outOf) return sum + t.amount
      if (outOf && !into) return sum - t.amount
      return sum
    }, 0)
}

/** Savings goal for a month from Settings: savings_goal_monthly, then savings_goal_monthly_after from savings_goal_change_month. */
export function savingsGoal(wb: Workbook, month: string): Centavos {
  const s = (key: string) => wb.settings[key]?.value ?? ''
  const change = s('savings_goal_change_month')
  const value = change && month >= change ? s('savings_goal_monthly_after') : s('savings_goal_monthly')
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}
