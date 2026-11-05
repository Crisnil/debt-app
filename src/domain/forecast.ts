import type { Centavos } from '../lib/money'
import { billFor, nextBill, type Bill } from './billing'
import { payablesByMonth } from './payables'
import { summarizeCard } from './dues'
import { reconcileCard } from './reconcile'
import type { Card, IsoDate, StatementLine, Workbook } from './types'

/** How many past statements the "usual spending" estimate looks at. */
export const USUAL_STATEMENTS = 3
/** Months of bills in the forecast, counted by due month from this month. */
export const FORECAST_MONTHS = 12

export type BillForecast = {
  cardId: string
  bill: Bill
  /** Unpaid part of the latest statement, when its due date is still ahead. */
  statementLeft: Centavos
  /** Installments on this bill: from its statement lines, or from the plans still running. */
  installments: Centavos
  /** Straight purchases and refunds: from the statement lines, or the logged expenses for this bill. */
  purchases: Centavos
  /** Interest and fee lines on the statement. */
  fees: Centavos
  /** Unpaid balance carried from the last statement plus estimated interest. First bill after the statement only. */
  carried: Centavos
  /** The estimated interest inside `carried` (0 when the statement already shows interest in `fees`). */
  interestEstimate: Centavos
  /** Usual spending not logged yet (average of the last statements minus what is logged). 0 when the statement lines are in. */
  estimate: Centavos
  /** The statement lines for this bill are in the sheet. */
  fromStatement: boolean
  total: Centavos
}

export type InstallmentPlan = {
  cardId: string
  description: string
  monthly: Centavos
  /** Payments after the latest statement that has this plan. */
  termsLeft: number
  /** The last bill with this plan. */
  lastBill: Bill
}

export type CardForecast = {
  card: Card
  bills: BillForecast[]
  plans: InstallmentPlan[]
  /** Everything owed on the card: billed balance not paid yet, new charges, logged expenses, and installments not billed yet. */
  owed: Centavos
  /** owed ÷ credit limit, 0–1+. null when the limit is not set. */
  used: number | null
}

const month = (date: IsoDate) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1
const sum = (values: number[]) => values.reduce((s, v) => s + v, 0)
const latestDate = (dates: IsoDate[]) => dates.reduce<IsoDate | null>((max, d) => (max === null || d > max ? d : max), null)

/** Statement dates that have lines in the sheet, newest first. */
function statementDates(lines: StatementLine[]): IsoDate[] {
  return [...new Set(lines.map((l) => l.statementDate))].sort().reverse()
}

/** Average straight purchases (with refunds) per statement over the last few statements. */
export function usualSpending(lines: StatementLine[]): Centavos {
  const dates = statementDates(lines).slice(0, USUAL_STATEMENTS)
  if (dates.length === 0) return 0
  const total = sum(lines.filter((l) => dates.includes(l.statementDate) && (l.type === 'straight' || l.type === 'credit')).map((l) => l.amount))
  return Math.max(Math.round(total / dates.length), 0)
}

/** Installment plans on the latest statement that has installments, with the payments still to come. */
export function installmentPlans(card: Card, lines: StatementLine[]): InstallmentPlan[] {
  const withTerms = lines.filter((l) => l.type === 'installment' && l.termNo !== null && l.totalTerms !== null)
  const latest = latestDate(withTerms.map((l) => l.statementDate))
  if (!latest) return []
  return withTerms
    .filter((l) => l.statementDate === latest)
    .map((l) => {
      const termsLeft = Math.max(l.totalTerms! - l.termNo!, 0)
      let lastBill: Bill = { statementDate: latest, dueDate: billFor(card, latest)?.dueDate ?? latest }
      for (let i = 0; i < termsLeft; i++) lastBill = nextBill(card, lastBill.statementDate) ?? lastBill
      return { cardId: card.cardId, description: l.description, monthly: l.amount, termsLeft, lastBill }
    })
}

export function forecastCard(wb: Workbook, card: Card, today: IsoDate): CardForecast {
  const lines = wb.lines.filter((l) => l.cardId === card.cardId)
  const summary = summarizeCard(wb, card, today)
  const snapshot = summary.snapshot
  const plans = installmentPlans(card, lines)
  const planStatement = latestDate(lines.filter((l) => l.type === 'installment' && l.termNo !== null).map((l) => l.statementDate))
  const unbilled = reconcileCard(wb, card.cardId).unbilled
  const usual = usualSpending(lines)
  const lastMonth = month(today) + FORECAST_MONTHS - 1

  // Bills after the latest statement with totals (snapshot), or after the latest statement lines.
  const anchor = snapshot?.asOf ?? statementDates(lines)[0] ?? null
  const bills: BillForecast[] = []
  const empty = { statementLeft: 0, installments: 0, purchases: 0, fees: 0, carried: 0, estimate: 0 }
  if (snapshot && snapshot.dueDate >= today && summary.remainingDue > 0) {
    bills.push({ cardId: card.cardId, bill: { statementDate: snapshot.asOf, dueDate: snapshot.dueDate }, ...empty, interestEstimate: 0, statementLeft: summary.remainingDue, fromStatement: true, total: summary.remainingDue })
  }
  let bill = anchor ? nextBill(card, anchor) : billFor(card, today)
  for (let first = true; bill && month(bill.dueDate) <= lastMonth; bill = nextBill(card, bill.statementDate), first = false) {
    if (bill.dueDate < today) continue
    const own = lines.filter((l) => l.statementDate === bill!.statementDate)
    const logged = sum(unbilled.filter((t) => billFor(card, t.date)?.statementDate === bill!.statementDate).map((t) => t.amount))
    const fromStatement = own.length > 0
    const installments = fromStatement
      ? sum(own.filter((l) => l.type === 'installment').map((l) => l.amount))
      : planStatement
        ? sum(plans.filter((p) => p.termsLeft >= month(bill!.statementDate) - month(planStatement)).map((p) => p.monthly))
        : 0
    const purchases = fromStatement ? sum(own.filter((l) => l.type === 'straight' || l.type === 'credit').map((l) => l.amount)) + logged : logged
    const fees = sum(own.filter((l) => l.type === 'interest' || l.type === 'fee').map((l) => l.amount))
    // Carried: the latest statement was due and not fully paid. Interest is an estimate until the statement shows it.
    const pastDue = first && snapshot?.dueDate ? snapshot.dueDate < today : false
    const carriedBase = pastDue ? summary.remainingDue : 0
    const carried = carriedBase + (fees > 0 ? 0 : Math.round(carriedBase * (card.monthlyRate ?? 0.03)))
    const estimate = fromStatement ? 0 : Math.max(usual - logged, 0)
    const parts = { statementLeft: 0, installments, purchases, fees, carried, estimate }
    bills.push({ cardId: card.cardId, bill, ...parts, interestEstimate: carried - carriedBase, fromStatement, total: sum(Object.values(parts)) })
  }

  // Owed: billed balance left + charges after that statement + logged expenses not billed + installments not billed yet.
  const paidSince = snapshot ? sum(wb.payments.filter((p) => p.cardId === card.cardId && p.date >= snapshot.asOf && p.date <= today).map((p) => p.amount)) : 0
  const base = snapshot ? snapshot.outstanding - paidSince : 0
  const newCharges = sum(lines.filter((l) => l.type !== 'payment' && (snapshot ? l.statementDate > snapshot.asOf : l.statementDate === anchor)).map((l) => l.amount))
  const futureInstallments = sum(plans.map((p) => p.monthly * p.termsLeft))
  const owed = Math.max(base + newCharges + sum(unbilled.map((t) => t.amount)) + futureInstallments, 0)
  const used = card.creditLimit ? owed / card.creditLimit : null

  return { card, bills, plans, owed, used }
}

export function forecastCards(wb: Workbook, today: IsoDate): CardForecast[] {
  return wb.cards.filter((c) => c.active).map((c) => forecastCard(wb, c, today))
}

export type MonthBills = {
  month: string
  /** One entry per card, plus one for payables (cardId PAYABLES) when added with withPayables. */
  byCard: { cardId: string; committed: Centavos; estimate: Centavos; bills: BillForecast[]; items?: { label: string; amount: Centavos }[] }[]
  total: Centavos
}

/** Series id of bills and money owed outside the cards. */
export const PAYABLES = 'payables'

/** Bills grouped by due month (YYYY-MM): what you pay each month. Committed = everything except the usual-spending estimate. */
export function billsByMonth(forecasts: CardForecast[], today: IsoDate): MonthBills[] {
  const months: string[] = []
  for (let i = 0; i < FORECAST_MONTHS; i++) {
    const m = month(today) + i
    months.push(`${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`)
  }
  return months.map((m) => {
    const byCard = forecasts.map((f) => {
      const bills = f.bills.filter((b) => b.bill.dueDate.startsWith(m))
      const estimate = sum(bills.map((b) => b.estimate))
      return { cardId: f.card.cardId, committed: sum(bills.map((b) => b.total)) - estimate, estimate, bills }
    })
    return { month: m, byCard, total: sum(byCard.map((c) => c.committed + c.estimate)) }
  })
}

export type PlanEnding = { lastDue: string; monthly: Centavos; plans: InstallmentPlan[] }

/** Installment plans grouped by the month of their last payment (due month), soonest first. */
export function installmentsEnding(forecasts: CardForecast[]): PlanEnding[] {
  const groups = new Map<string, InstallmentPlan[]>()
  for (const p of forecasts.flatMap((f) => f.plans).filter((p) => p.termsLeft > 0)) {
    const key = p.lastBill.dueDate.slice(0, 7)
    groups.set(key, [...(groups.get(key) ?? []), p])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([lastDue, plans]) => ({ lastDue, monthly: sum(plans.map((p) => p.monthly)), plans }))
}

/** Recurring income in the plan per month. */
export function monthlyIncome(wb: Workbook): Centavos {
  return sum(wb.incomeSources.filter((s) => s.active && s.inPlan).map((s) => s.amount * (s.frequency === 'per_payday' ? s.days.length : 1)))
}

/** Adds what is left on payables (bills, money owed) to each month. Late payables count in the first month. */
export function withPayables(months: MonthBills[], wb: Workbook): MonthBills[] {
  if (months.length === 0) return months
  const byMonth = payablesByMonth(wb, months[0].month, months.length)
  return months.map((m) => {
    const items = (byMonth.get(m.month) ?? []).map((p) => ({ label: p.payable.name, amount: p.left }))
    const committed = sum(items.map((i) => i.amount))
    return { ...m, byCard: [...m.byCard, { cardId: PAYABLES, committed, estimate: 0, bills: [], items }], total: m.total + committed }
  })
}
