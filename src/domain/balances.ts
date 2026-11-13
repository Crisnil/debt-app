import type { Centavos } from '../lib/money'
import { moneyAccounts } from './accounts'
import type { Account, BalanceCheck, IsoDate, Workbook } from './types'

export type AccountBalance = { account: Account; balance: Centavos }

/** Money in − money out of the account for entries dated after `after` (when set) up to `upTo` (when set). */
function moved(wb: Workbook, id: string, after: IsoDate, upTo = ''): Centavos {
  const inRange = (date: IsoDate) => (!after || date > after) && (!upTo || date <= upTo)
  let sum = 0
  for (const i of wb.incomeLog) if (i.toAccount === id && inRange(i.date)) sum += i.amount
  for (const t of wb.transfers) {
    if (!inRange(t.date)) continue
    if (t.toAccount === id) sum += t.amount
    if (t.fromAccount === id) sum -= t.amount
  }
  for (const e of wb.transactions) if (e.methodId === id && inRange(e.date)) sum -= e.amount
  for (const p of wb.payments) if (p.fromAccount === id && inRange(p.date)) sum -= p.amount
  return sum
}

/** Balance checks of the account from its opening date, oldest first. Same day: the last one typed wins. */
function checksFor(wb: Workbook, account: Account): BalanceCheck[] {
  const byDate = new Map<IsoDate, BalanceCheck>()
  const own = wb.balanceChecks
    .filter((c) => c.accountId === account.accountId && (!account.openingDate || c.date >= account.openingDate))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  for (const c of own) byDate.set(c.date, c)
  return [...byDate.values()]
}

/**
 * Balance = the last balance check (or the opening balance) + money in − money out after its date.
 * Money in: income, transfers in. Money out: expenses paid from the account, transfers out, card payments.
 */
export function accountBalances(wb: Workbook): AccountBalance[] {
  return moneyAccounts(wb)
    .filter((a) => a.active)
    .map((account) => {
      const last = checksFor(wb, account).at(-1)
      const balance = last ? last.balance + moved(wb, account.accountId, last.date) : account.openingBalance + moved(wb, account.accountId, account.openingDate)
      return { account, balance }
    })
}

export type CheckResult = {
  check: BalanceCheck
  account: Account
  /** What the app had for the end of the check date. */
  expected: Centavos
  /** Real − expected. Below 0: money went out that was not recorded. */
  difference: Centavos
  /** The part counted as "Not recorded" spending: a drop, when counted. */
  notRecorded: Centavos
}

/** Each balance check against what the app expected from the previous check (or the opening balance). Newest first. */
export function checkResults(wb: Workbook): CheckResult[] {
  const results: CheckResult[] = []
  for (const account of moneyAccounts(wb)) {
    let start = account.openingBalance
    let from = account.openingDate
    for (const check of checksFor(wb, account)) {
      const expected = start + moved(wb, account.accountId, from, check.date)
      const difference = check.balance - expected
      const counts = check.countDifference && difference < 0
      results.push({ check, account, expected, difference, notRecorded: counts ? -difference : 0 })
      start = check.balance
      from = check.date
    }
  }
  return results.sort((a, b) => b.check.date.localeCompare(a.check.date) || b.check.createdAt.localeCompare(a.check.createdAt))
}

/** Active money accounts without a balance check in the month (YYYY-MM). */
export function accountsToCheck(wb: Workbook, month: string): Account[] {
  return moneyAccounts(wb).filter((a) => a.active && !wb.balanceChecks.some((c) => c.accountId === a.accountId && c.date.startsWith(month)))
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
