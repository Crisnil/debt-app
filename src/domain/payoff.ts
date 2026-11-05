import type { Centavos } from '../lib/money'
import { billsByMonth, forecastCards, type CardForecast } from './forecast'
import { addMonths, payablesByMonth } from './payables'
import { spendingItems } from './reconcile'
import type { IsoDate, Workbook } from './types'

/** How far ahead the payoff path looks (months). */
export const PAYOFF_MONTHS = 60

/** One month of input for the payoff path. All amounts in centavos. */
export type PayoffMonthInput = {
  month: string
  /** Card charges we know: statement left, installments, purchases on statements or logged, fees and interest on statements. */
  cardKnown: Centavos
  /** Usual card spending not logged yet (estimate). A spending cut lowers this part. */
  cardEstimate: Centavos
  /** Card installments in this month (part of cardKnown). Used to find the debt-free month. */
  installments: Centavos
  /** Bills and money owed outside the cards, due this month. Paid first, from income. */
  nonCard: Centavos
  /** The part of nonCard that is debt with an end (a loan or a one-time bill), not a living cost like electric. */
  nonCardDebt: Centavos
  /** A carried balance that the forecast already knows (unpaid statement after its due date) and its interest. */
  carriedIn: Centavos
  carriedInterest: Centavos
}

export type PayoffInput = {
  months: PayoffMonthInput[]
  /** Monthly income in the plan. */
  income: Centavos
  /** Interest per month on a balance the path carries (estimate). */
  rate: number
  /** Share of usual spending cut, 0–1. */
  cut: number
}

export type PayoffMonth = {
  month: string
  cardBill: Centavos
  interest: Centavos
  nonCard: Centavos
  paid: Centavos
  /** Bills outside the cards not paid this month (income was too low). */
  unpaid: Centavos
  /** Card balance not paid this month: carried to the next bill with interest. */
  carried: Centavos
  /** Income left after all bills this month. */
  saved: Centavos
  savedTotal: Centavos
  /** Still owed after this month: carried balance, unpaid bills, and installments and loans billed in later months. */
  owed: Centavos
}

export type PayoffResult = {
  months: PayoffMonth[]
  /** First month whose card bill is paid in full (no balance carried after it). */
  interestStops: string | null
  /** Interest stops, card installments are done, and no bill outside the cards is left unpaid. */
  debtFree: string | null
  interestTotal: Centavos
}

/**
 * The payoff path. Each month: bills outside the cards are paid first; the card bill (known charges + usual spending
 * + carried balance + interest) is paid with what is left; the rest of the card bill is carried; money left over is saved.
 */
export function runPayoff({ months, income, rate, cut }: PayoffInput): PayoffResult {
  let carry = 0
  let backlog = 0 // bills outside the cards not paid yet
  let savedTotal = 0
  let interestTotal = 0
  const rows: PayoffMonth[] = []
  for (const m of months) {
    const interest = Math.round(carry * rate) + m.carriedInterest
    interestTotal += interest
    const cardBill = m.cardKnown + Math.round(m.cardEstimate * (1 - cut)) + carry + m.carriedIn + interest
    const nonCard = m.nonCard + backlog
    const payNonCard = Math.min(nonCard, Math.max(income, 0))
    backlog = nonCard - payNonCard
    const left = Math.max(income - payNonCard, 0)
    const payCard = Math.min(cardBill, left)
    carry = cardBill - payCard
    const saved = left - payCard
    savedTotal += saved
    rows.push({ month: m.month, cardBill, interest, nonCard, paid: payNonCard + payCard, unpaid: backlog, carried: carry, saved, savedTotal, owed: 0 })
  }
  // Owed after each month: what is carried or unpaid now, plus installments and loans still to be billed.
  let later = 0
  for (let i = rows.length - 1; i >= 0; i--) {
    rows[i].owed = rows[i].carried + rows[i].unpaid + later
    later += months[i].installments + months[i].nonCardDebt
  }

  const lastIndex = (ok: (i: number) => boolean) => rows.reduce((last, _, i) => (ok(i) ? i : last), -1)
  const firstClear = rows.findIndex((r) => r.carried === 0)
  const interestStops = firstClear >= 0 ? rows[firstClear].month : null
  // Debt-free month: the last of — the last installment, the month after the last carried balance or unpaid bill,
  // and the last payment of a debt outside the cards. null when still in debt at the end of the path.
  const lastCarry = lastIndex((i) => rows[i].carried > 0 || rows[i].unpaid > 0)
  const free = Math.max(lastIndex((i) => months[i].installments > 0), lastIndex((i) => months[i].nonCardDebt > 0), lastCarry + 1, 0)
  const debtFree = free < rows.length ? rows[free].month : null
  return { months: rows, interestStops, debtFree, interestTotal }
}

export type PayoffOptions = {
  /** Share of usual spending cut, 0–1. */
  cut?: number
  /** Income sources (source_id) left out of the plan, e.g. the allowance. */
  excludeIncome?: string[]
  /**
   * Monthly living costs (planned expenses, or the actual average). When set, they replace the usual card spending,
   * and open-ended bills (electric, water…) are not added again; loans with an end still count.
   */
  living?: Centavos
}

/** Average monthly_rate of the active cards (3% when not set). */
export function carryRate(forecasts: CardForecast[]): number {
  const rates = forecasts.map((f) => f.card.monthlyRate ?? 0.03)
  return rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : 0.03
}

/** Builds the payoff input from the live sheet: card forecasts, payables, and income in the plan. */
export function payoffInput(wb: Workbook, today: IsoDate, options: PayoffOptions = {}, count = PAYOFF_MONTHS): PayoffInput {
  const forecasts = forecastCards(wb, today, count)
  const byMonth = billsByMonth(forecasts, today, count)
  const payables = payablesByMonth(wb, byMonth[0].month, count)
  const exclude = new Set(options.excludeIncome ?? [])
  const income = wb.incomeSources
    .filter((s) => s.active && s.inPlan && !exclude.has(s.sourceId))
    .reduce((sum, s) => sum + s.amount * (s.frequency === 'per_payday' ? s.days.length : 1), 0)
  const months = byMonth.map((m): PayoffMonthInput => {
    const bills = m.byCard.flatMap((c) => c.bills)
    const sum = (f: (b: (typeof bills)[number]) => number) => bills.reduce((s, b) => s + f(b), 0)
    return {
      month: m.month,
      cardKnown: sum((b) => b.statementLeft + b.installments + b.purchases + b.fees),
      // Living costs this month, less card purchases already known for this month's bills (spent last month).
      cardEstimate: options.living === undefined ? sum((b) => b.estimate) : Math.max(options.living - sum((b) => b.purchases), 0),
      installments: sum((b) => b.installments),
      nonCard: (payables.get(m.month) ?? []).filter((p) => options.living === undefined || !p.payable.recurring || p.payable.times !== null).reduce((s, p) => s + p.left, 0),
      nonCardDebt: (payables.get(m.month) ?? []).filter((p) => !p.payable.recurring || p.payable.times !== null).reduce((s, p) => s + p.left, 0),
      carriedIn: sum((b) => b.carried - b.interestEstimate),
      carriedInterest: sum((b) => b.interestEstimate),
    }
  })
  return { months, income, rate: carryRate(forecasts), cut: options.cut ?? 0 }
}

/** The payoff path from the live sheet. */
export function payoffPath(wb: Workbook, today: IsoDate, options: PayoffOptions = {}): PayoffResult {
  return runPayoff(payoffInput(wb, today, options))
}

/** Whole months from this month to `month` (YYYY-MM). */
export function monthsUntil(today: IsoDate, month: string): number {
  return (Number(month.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + Number(month.slice(5, 7)) - Number(today.slice(5, 7))
}

/** Planned monthly living costs: the total of the active planned expense lines. null when there are none. */
export function plannedLiving(wb: Workbook): Centavos | null {
  const lines = wb.plannedExpenses.filter((e) => e.active)
  return lines.length ? lines.reduce((s, e) => s + e.amount, 0) : null
}

export type ActualLiving = { monthly: Centavos; months: string[] }

/**
 * Actual monthly living costs: average spending (each purchase once) over the last 3 full months since you started
 * logging. null until there is one full month of entries.
 */
export function actualLiving(wb: Workbook, today: IsoDate): ActualLiving | null {
  const start = wb.transactions.reduce<string | null>((min, t) => (min === null || t.date < min ? t.date : min), null)
  if (!start) return null
  const items = spendingItems(wb)
  const thisMonth = today.slice(0, 7)
  const full: string[] = []
  for (let m = addMonths(start.slice(0, 7), 1); m < thisMonth && full.length < 36; m = addMonths(m, 1)) full.push(m)
  const months = full.slice(-3)
  if (months.length === 0) return null
  const total = items.filter((i) => months.includes(i.date.slice(0, 7))).reduce((s, i) => s + i.amount, 0)
  // Payments of loans and one-time debts are debt, not living costs: the path counts them already.
  const debt = new Set(wb.payables.filter((p) => !p.recurring || p.times !== null).map((p) => p.payableId))
  const debtPaid = wb.transactions.filter((t) => t.payableId && debt.has(t.payableId) && months.includes(t.date.slice(0, 7))).reduce((s, t) => s + t.amount, 0)
  return { monthly: Math.round(Math.max(total - debtPaid, 0) / months.length), months }
}

export type PayoffPaths = {
  /** Usual card spending only (no cash): shown when there are no planned expenses yet. */
  cards: PayoffResult
  planned: { result: PayoffResult; living: Centavos } | null
  actual: { result: PayoffResult; living: ActualLiving } | null
  /** The path to trust most: actual, else planned, else cards only. */
  main: PayoffResult
}

export function payoffPaths(wb: Workbook, today: IsoDate, options: Omit<PayoffOptions, 'living'> = {}): PayoffPaths {
  const cards = payoffPath(wb, today, options)
  const plan = plannedLiving(wb)
  const act = actualLiving(wb, today)
  const planned = plan === null ? null : { result: payoffPath(wb, today, { ...options, living: plan }), living: plan }
  const actual = act === null ? null : { result: payoffPath(wb, today, { ...options, living: act.monthly }), living: act }
  return { cards, planned, actual, main: actual?.result ?? planned?.result ?? cards }
}
