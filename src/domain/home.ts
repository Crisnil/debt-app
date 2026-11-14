import type { Centavos } from '../lib/money'
import { entries } from './activity'
import { accountBalances, savedInMonth } from './balances'
import { daysBetween, summarizeDues } from './dues'
import { billsByMonth, installmentsEnding, monthlyIncome, PAYABLES, withPayables, type CardForecast, type PlanEnding } from './forecast'
import { addMonths, payableMonths, payablesOwed } from './payables'
import type { AccountType, IsoDate, Workbook } from './types'

export type OwedPart = { id: string; name: string; amount: Centavos; to: string }

/** What we owe, per card and for payables (bills and money owed outside the cards). Biggest first; zero parts left out. */
export function owedParts(wb: Workbook, forecasts: CardForecast[], today: IsoDate): OwedPart[] {
  const parts: OwedPart[] = forecasts.map((f) => ({ id: f.card.cardId, name: f.card.name, amount: f.owed, to: `/cards/${f.card.cardId}` }))
  parts.push({ id: PAYABLES, name: 'Bills & payables', amount: payablesOwed(wb, today), to: '/bills' })
  return parts.filter((p) => p.amount > 0)
}

export type SavingsPart = { id: string; name: string; amount: Centavos }

/** Balances of the accounts marked as savings (is_savings). Cash, payroll, and e-wallets are not savings. */
export function savingsParts(wb: Workbook): SavingsPart[] {
  return accountBalances(wb)
    .filter((b) => b.account.isSavings)
    .map((b) => ({ id: b.account.accountId, name: b.account.label, amount: Math.max(b.balance, 0) }))
}

export type MoneyPart = { id: string; name: string; type: AccountType; amount: Centavos; isSavings: boolean; maintaining: Centavos }

/** What we have: the balance of every active money account (banks, cash, e-wallets), biggest first. */
export function moneyParts(wb: Workbook): MoneyPart[] {
  return accountBalances(wb)
    .map((b) => ({ id: b.account.accountId, name: b.account.label, type: b.account.type, amount: b.balance, isSavings: b.account.isSavings, maintaining: b.account.maintainingBalance }))
    .sort((a, b) => b.amount - a.amount)
}

/** Totals of what we have: all accounts, savings goal money, and spendable now (not savings goal money, above the maintaining balance). */
export function moneyTotals(parts: MoneyPart[]): { total: Centavos; savings: Centavos; spendable: Centavos } {
  return {
    total: parts.reduce((s, p) => s + Math.max(p.amount, 0), 0),
    savings: parts.filter((p) => p.isSavings).reduce((s, p) => s + Math.max(p.amount, 0), 0),
    spendable: parts.filter((p) => !p.isSavings).reduce((s, p) => s + Math.max(p.amount - p.maintaining, 0), 0),
  }
}

/** The last installment payment of all cards: its due month and the months left from this month. */
export function lastInstallment(forecasts: CardForecast[], today: IsoDate): { month: string; monthsLeft: number } | null {
  const last = installmentsEnding(forecasts).at(-1)
  if (!last) return null
  const months = (Number(last.lastDue.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + Number(last.lastDue.slice(5, 7)) - Number(today.slice(5, 7))
  return { month: last.lastDue, monthsLeft: Math.max(months, 0) }
}

export type DueItem = { key: string; name: string; detail: string; amount: Centavos; dueDate: IsoDate; to: string }

/** Card bills and payables not paid yet, up to `days` ahead (late ones too), soonest first. */
export function dueItems(wb: Workbook, forecasts: CardForecast[], today: IsoDate, days: number): DueItem[] {
  const items: DueItem[] = []
  for (const f of forecasts) {
    for (const b of f.bills) {
      if (b.total <= 0 || daysBetween(today, b.bill.dueDate) > days) continue
      const detail = b.statementLeft ? 'left on the statement' : b.fromStatement ? 'statement lines in' : 'estimate'
      items.push({ key: `${f.card.cardId}-${b.bill.statementDate}`, name: f.card.name, detail, amount: b.total, dueDate: b.bill.dueDate, to: `/add?type=pay&card=${f.card.cardId}` })
    }
  }
  for (const c of summarizeDues(wb, today).cards) {
    if (c.status === 'overdue' && c.snapshot) {
      items.push({ key: `${c.card.cardId}-late`, name: c.card.name, detail: 'left on the statement', amount: c.remainingDue, dueDate: c.snapshot.dueDate, to: `/add?type=pay&card=${c.card.cardId}` })
    }
  }
  for (const m of payableMonths(wb, addMonths(today.slice(0, 7), 2))) {
    if (m.left <= 0 || daysBetween(today, m.dueDate) > days) continue
    items.push({ key: `${m.payable.payableId}-${m.month}`, name: m.payable.name, detail: m.payable.payee || m.payable.category, amount: m.left, dueDate: m.dueDate, to: '/bills' })
  }
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

/** Days ahead that count for the app icon badge. */
export const BADGE_DAYS = 3

/** Number on the app icon: bills and card bills late or due in the next BADGE_DAYS days. */
export function badgeCount(wb: Workbook, forecasts: CardForecast[], today: IsoDate): number {
  return dueItems(wb, forecasts, today, BADGE_DAYS).length
}

export type CarriedAlert = { cardId: string; name: string; carried: Centavos; interest: Centavos; statementDate: IsoDate }

/** Cards with an unpaid balance carried to the next bill, and the interest it will cost (estimate). */
export function carriedAlerts(forecasts: CardForecast[]): CarriedAlert[] {
  return forecasts.flatMap((f) =>
    f.bills
      .filter((b) => b.carried > 0)
      .slice(0, 1)
      .map((b) => ({ cardId: f.card.cardId, name: f.card.name, carried: b.carried - b.interestEstimate, interest: b.interestEstimate || b.fees, statementDate: b.bill.statementDate })),
  )
}

export type ThisMonth = { month: string; bills: Centavos; income: Centavos; interest: Centavos }

/** Bills due this month (cards and payables), the plan's monthly income, and interest on those bills (statement or estimate). */
export function thisMonth(wb: Workbook, forecasts: CardForecast[], today: IsoDate): ThisMonth {
  const first = withPayables(billsByMonth(forecasts, today), wb)[0]
  const interest = first.byCard.flatMap((c) => c.bills).reduce((s, b) => s + b.fees + b.interestEstimate, 0)
  return { month: first.month, bills: first.total, income: monthlyIncome(wb), interest }
}

/** The next installment plan(s) to end from this month on: bills drop by `monthly` after `lastDue`. */
export function nextDrop(forecasts: CardForecast[], today: IsoDate): PlanEnding | null {
  return installmentsEnding(forecasts).find((e) => e.lastDue >= today.slice(0, 7)) ?? null
}

export type MonthFlow = { month: string; spent: Centavos; saved: Centavos }

/** The last `count` months, oldest first: spending (purchases less refunds) and net money moved into savings accounts. */
export function monthlyFlow(wb: Workbook, today: IsoDate, count = 6): MonthFlow[] {
  const purchases = entries(wb).filter((e) => e.kind === 'purchase')
  return Array.from({ length: count }, (_, i) => addMonths(today.slice(0, 7), i - count + 1)).map((month) => ({
    month,
    spent: purchases.filter((e) => e.date.startsWith(month)).reduce((s, e) => s + e.amount, 0),
    saved: savedInMonth(wb, month),
  }))
}
