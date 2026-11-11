import type { Centavos } from '../lib/money'
import { cardForMethod } from './accounts'
import { daysBetween } from './dues'
import { billsByMonth, forecastCards, usualSpending, type CardForecast } from './forecast'
import { addMonths, payablesByMonth } from './payables'
import { spendingItems } from './reconcile'
import type { IsoDate, Payable, PlannedExpense, Workbook } from './types'

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
  /** What is left on statements already out (part of cardKnown): spending from before, not this month's living costs. */
  statementLeft?: Centavos
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
  /** The monthly math: income − living − nonCard − installments − earlier − interest = saved (or short when below 0). */
  income: Centavos
  /** Spending this month: card purchases and fees on this bill, and usual spending (after the cut). */
  living: Centavos
  installments: Centavos
  /** Card balance from before: left on statements already out, and the balance carried from last month. */
  earlier: Centavos
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
    const estimate = Math.round(m.cardEstimate * (1 - cut))
    const earlier = (m.statementLeft ?? 0) + carry + m.carriedIn
    const cardBill = m.cardKnown + estimate + carry + m.carriedIn + interest
    const nonCard = m.nonCard + backlog
    const payNonCard = Math.min(nonCard, Math.max(income, 0))
    backlog = nonCard - payNonCard
    const left = Math.max(income - payNonCard, 0)
    const payCard = Math.min(cardBill, left)
    carry = cardBill - payCard
    const saved = left - payCard
    savedTotal += saved
    rows.push({
      month: m.month,
      cardBill,
      interest,
      nonCard,
      income,
      living: m.cardKnown - m.installments - (m.statementLeft ?? 0) + estimate,
      installments: m.installments,
      earlier,
      paid: payNonCard + payCard,
      unpaid: backlog,
      carried: carry,
      saved,
      savedTotal,
      owed: 0,
    })
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
   * Monthly living costs (planned expenses, or the actual average), per month. When set, they replace the usual card
   * spending, and open-ended bills (electric, water…) are not added again; loans with an end still count.
   */
  living?: Centavos | ((month: string) => Centavos)
  /** Payables already in the living costs (planned lines linked to a bill): not added again as bills. */
  inLiving?: ReadonlySet<string>
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
  const { living, inLiving } = options
  const months = byMonth.map((m): PayoffMonthInput => {
    const bills = m.byCard.flatMap((c) => c.bills)
    const sum = (f: (b: (typeof bills)[number]) => number) => bills.reduce((s, b) => s + f(b), 0)
    const livingNow = typeof living === 'function' ? living(m.month) : living
    return {
      month: m.month,
      cardKnown: sum((b) => b.statementLeft + b.installments + b.purchases + b.fees),
      // Living costs this month, less card purchases already known for this month's bills (spent last month).
      cardEstimate: livingNow === undefined ? sum((b) => b.estimate) : Math.max(livingNow - sum((b) => b.purchases), 0),
      installments: sum((b) => b.installments),
      statementLeft: sum((b) => b.statementLeft),
      nonCard: (payables.get(m.month) ?? [])
        .filter((p) => livingNow === undefined || ((!p.payable.recurring || p.payable.times !== null) && !inLiving?.has(p.payable.payableId)))
        .reduce((s, p) => s + p.left, 0),
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

/** The bill a planned line is linked to, when the link is set and the bill is in the sheet. */
export function linkedPayable(wb: Workbook, item: PlannedExpense): Payable | null {
  return (item.payableId && wb.payables.find((p) => p.payableId === item.payableId)) || null
}

/** Last month (YYYY-MM) of a bill with an end; null for an open-ended bill. */
export function payableLastMonth(p: Payable): string | null {
  if (p.recurring && p.times === null) return null
  return addMonths(p.startMonth, (p.recurring ? p.times! : 1) - 1)
}

/** A planned line counts in a month unless it is linked to a bill that is stopped, not started yet, or done by then. */
export function plannedLineIn(wb: Workbook, item: PlannedExpense, month: string): boolean {
  if (!item.active) return false
  const p = linkedPayable(wb, item)
  if (!p) return true
  if (!p.active || !p.startMonth || month < p.startMonth) return false
  const last = payableLastMonth(p)
  return last === null || month <= last
}

/** The bill of a planned line is done: stopped, or its last month is before `month`. Done lines are hidden and not counted. */
export function plannedLineDone(wb: Workbook, item: PlannedExpense, month: string): boolean {
  const p = linkedPayable(wb, item)
  if (!p) return false
  const last = payableLastMonth(p)
  return !p.active || (last !== null && last < month)
}

/** Planned living costs in a month: the active planned lines that count then. null when there are no active lines. */
export function plannedLiving(wb: Workbook, month: string): Centavos | null {
  const lines = wb.plannedExpenses.filter((e) => e.active && !plannedLineDone(wb, e, month))
  return lines.length ? lines.filter((e) => plannedLineIn(wb, e, month)).reduce((s, e) => s + e.amount, 0) : null
}

/** Bills linked from an active planned line: the Plan counts them as living costs, not again as bills. */
export function plannedPayables(wb: Workbook): Set<string> {
  return new Set(wb.plannedExpenses.filter((e) => e.active && linkedPayable(wb, e)).map((e) => e.payableId))
}

/** Open-ended monthly bills (electric, water…) that no active planned line is linked to. */
export function billsNotInPlan(wb: Workbook): Payable[] {
  const linked = plannedPayables(wb)
  return wb.payables.filter((p) => p.active && p.recurring && p.times === null && !linked.has(p.payableId))
}

/** Days of cash entries needed before this month so far is scaled to a full month. */
export const MIN_CASH_DAYS = 7

export type ActualLiving = {
  monthly: Centavos
  /** Usual card spending: average straight purchases on the last 3 statements of each card. */
  card: Centavos
  /** Cash, bank, and e-wallet-load spending per month. null when there are not enough entries yet. */
  cash: Centavos | null
  /** What the cash part is based on: full months, or this month so far scaled to a full month. */
  cashBasis: { kind: 'months'; months: string[] } | { kind: 'partial'; from: IsoDate; to: IsoDate } | null
}

/**
 * Actual monthly living costs, from real data:
 * - cards: average straight purchases on the last 3 statements of each card (the statements cover card spending, so
 *   logged card expenses are not added again);
 * - cash, bank, and e-wallet loads (and bills paid that way): the average of the last 3 full months of entries, or,
 *   before the first full month, this month so far scaled to a full month once there are 7 days of entries.
 * Payments of loans and one-time debts are left out: the path counts them as debt. null when there is no data at all.
 */
export function actualLiving(wb: Workbook, today: IsoDate): ActualLiving | null {
  const card = wb.cards.filter((c) => c.active).reduce((s, c) => s + usualSpending(wb.lines.filter((l) => l.cardId === c.cardId)), 0)
  const debt = new Set(wb.payables.filter((p) => !p.recurring || p.times !== null).map((p) => p.payableId))
  const debtPaid = (inRange: (date: string) => boolean) =>
    wb.transactions.filter((t) => t.payableId && debt.has(t.payableId) && !cardForMethod(wb, t.methodId) && inRange(t.date)).reduce((s, t) => s + t.amount, 0)
  const cashItems = spendingItems(wb).filter((i) => !cardForMethod(wb, i.methodId))
  const cashSpent = (inRange: (date: string) => boolean) => Math.max(cashItems.filter((i) => inRange(i.date)).reduce((s, i) => s + i.amount, 0) - debtPaid(inRange), 0)

  const start = wb.transactions.filter((t) => !cardForMethod(wb, t.methodId)).reduce<string | null>((min, t) => (min === null || t.date < min ? t.date : min), null)
  const thisMonth = today.slice(0, 7)
  let cash: Centavos | null = null
  let cashBasis: ActualLiving['cashBasis'] = null
  if (start) {
    const full: string[] = []
    for (let m = addMonths(start.slice(0, 7), 1); m < thisMonth && full.length < 36; m = addMonths(m, 1)) full.push(m)
    const months = full.slice(-3)
    if (months.length > 0) {
      cash = Math.round(cashSpent((d) => months.includes(d.slice(0, 7))) / months.length)
      cashBasis = { kind: 'months', months }
    } else {
      const from = start > `${thisMonth}-01` ? start : `${thisMonth}-01`
      const days = daysBetween(from, today) + 1
      if (days >= MIN_CASH_DAYS) {
        const daysInMonth = new Date(Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(5, 7)), 0).getDate()
        cash = Math.round((cashSpent((d) => d >= from && d <= today) * daysInMonth) / days)
        cashBasis = { kind: 'partial', from, to: today }
      }
    }
  }
  if (card === 0 && cash === null) return null
  return { monthly: card + (cash ?? 0), card, cash, cashBasis }
}

export type PayoffPaths = {
  /** Usual card spending only (no cash): shown when there are no planned expenses yet. */
  cards: PayoffResult
  planned: { result: PayoffResult; living: Centavos } | null
  actual: { result: PayoffResult; living: ActualLiving } | null
  /** The path to trust most: actual, else planned, else cards only. */
  main: PayoffResult
}

export function payoffPaths(wb: Workbook, today: IsoDate, options: Omit<PayoffOptions, 'living' | 'inLiving'> = {}): PayoffPaths {
  const cards = payoffPath(wb, today, options)
  const plan = plannedLiving(wb, today.slice(0, 7))
  const act = actualLiving(wb, today)
  const planned =
    plan === null ? null : { result: payoffPath(wb, today, { ...options, living: (month) => plannedLiving(wb, month) ?? 0, inLiving: plannedPayables(wb) }), living: plan }
  const actual = act === null ? null : { result: payoffPath(wb, today, { ...options, living: act.monthly }), living: act }
  return { cards, planned, actual, main: actual?.result ?? planned?.result ?? cards }
}
