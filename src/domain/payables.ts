import type { Centavos } from '../lib/money'
import type { IsoDate, Payable, StatementLine, Transaction, Workbook } from './types'

/** Categories offered for payables, besides the ones in the Categories tab. */
export const PAYABLE_CATEGORIES = ['Utilities', 'Debt repayment']

/** One month of a payable: what is due, what is paid, and what is left. */
export type PayableMonth = {
  payable: Payable
  month: string
  /** 1-based count: the 2nd of 5 payments = 2. */
  number: number
  dueDate: IsoDate
  amount: Centavos
  /** The real amount for this month was set (it differs from the usual amount). */
  amountSet: boolean
  paid: Centavos
  left: Centavos
}

const toIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1
const fromIndex = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
export const addMonths = (month: string, n: number) => fromIndex(toIndex(month) + n)

/** The due date in a month: the due day, or the last day when the month is shorter (or no due day is set). */
export function dueDateIn(month: string, dueDay: number | null): IsoDate {
  const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
  return `${month}-${String(Math.min(dueDay ?? last, last)).padStart(2, '0')}`
}

/** Months of a payable up to `until` (YYYY-MM), first to last. One-time: the start month only. */
export function payableMonthList(p: Payable, until: string): string[] {
  if (!p.startMonth) return []
  const count = p.recurring ? (p.times ?? Infinity) : 1
  const last = Math.min(toIndex(p.startMonth) + count - 1, toIndex(until))
  const months: string[] = []
  for (let i = toIndex(p.startMonth); i <= last; i++) months.push(fromIndex(i))
  return months
}

export function paidFor(transactions: Transaction[], payableId: string, month: string): Centavos {
  return transactions.filter((t) => t.payableId === payableId && t.payableMonth === month).reduce((s, t) => s + t.amount, 0)
}

/**
 * Every month of every payable you pay yourself, up to `until`. Stopped payables keep only the months already paid in
 * part or in full. Bills charged to a card are left out: the card bill has them (see cardCharges).
 */
export function payableMonths(wb: Workbook, until: string): PayableMonth[] {
  const result: PayableMonth[] = []
  for (const p of wb.payables) {
    if (p.cardId) continue
    payableMonthList(p, until).forEach((month, i) => {
      // The newest amount set for the month wins (rows are in the order they were added).
      const set = wb.payableAmounts.filter((a) => a.payableId === p.payableId && a.month === month).at(-1)
      const amount = set?.amount ?? p.amount
      const paid = paidFor(wb.transactions, p.payableId, month)
      if (!p.active && paid === 0) return
      result.push({ payable: p, month, number: i + 1, dueDate: dueDateIn(month, p.dueDay), amount, amountSet: Boolean(set), paid, left: Math.max(amount - paid, 0) })
    })
  }
  return result.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

export type PayableProgress = { payable: Payable; paidTimes: number; times: number | null; left: Centavos }

/** For a payable with an end: how many months are fully paid and what is left in total. Open-ended: left up to this month. */
export function payableProgress(wb: Workbook, p: Payable, today: IsoDate): PayableProgress {
  const finite = !p.recurring || p.times !== null
  const until = finite ? addMonths(p.startMonth, (p.recurring ? p.times! : 1) - 1) : today.slice(0, 7)
  const months = payableMonths({ ...wb, payables: [p] }, until)
  return {
    payable: p,
    paidTimes: months.filter((m) => m.left === 0).length,
    times: p.recurring ? p.times : 1,
    left: months.reduce((s, m) => s + m.left, 0),
  }
}

/** Owed now: what is left this month and before, plus later months of payables with an end. Open-ended bills count up to this month only. */
export function payablesOwed(wb: Workbook, today: IsoDate): Centavos {
  return wb.payables.filter((p) => p.active && !p.cardId).reduce((s, p) => s + payableProgress(wb, p, today).left, 0)
}

/**
 * What is left to pay per due month, for the forecast. Months before `first` are added to `first` (they are late).
 * Future months of open-ended bills use the usual amount.
 */
export function payablesByMonth(wb: Workbook, first: string, months: number): Map<string, PayableMonth[]> {
  const last = addMonths(first, months - 1)
  const result = new Map<string, PayableMonth[]>()
  for (let i = 0; i < months; i++) result.set(addMonths(first, i), [])
  for (const m of payableMonths(wb, last)) {
    if (m.left === 0) continue
    const key = m.month < first ? first : m.month
    result.get(key)?.push(m)
  }
  return result
}

/** The Bills table: this month's payables, and earlier months still not paid (late) first. */
export function billsThisMonth(wb: Workbook, today: IsoDate): PayableMonth[] {
  const month = today.slice(0, 7)
  const rows = payableMonths(wb, month).filter((m) => m.month === month || m.left > 0)
  return rows.sort((a, b) => Number(b.month < month) - Number(a.month < month) || a.dueDate.localeCompare(b.dueDate))
}

/**
 * Before the usual amount of a payable changes: earlier months with a payment keep the amount they had.
 * Returns those months and amounts (to save as month amounts), so a paid month does not turn unpaid.
 */
export function monthsToKeep(wb: Workbook, p: Payable, today: IsoDate): { month: string; amount: Centavos }[] {
  const month = today.slice(0, 7)
  return payableMonths({ ...wb, payables: [p] }, addMonths(month, -1))
    .filter((m) => m.paid > 0 && !m.amountSet)
    .map((m) => ({ month: m.month, amount: m.amount }))
}

/** Charging a bill to a card needs Payables.card_id (Settings → Update sheet). */
export const canChargeToCard = (wb: Workbook) => (wb.headers.Payables ?? []).includes('card_id')

/** A bill charged to a card automatically (a subscription), and its charge on the card's statement. */
export type CardCharge = {
  payable: Payable
  /** This month's charge on the card's statement, when found. */
  charged: StatementLine | null
  /** The latest charge before this month, when found. */
  last: StatementLine | null
}

/** Words to find a subscription on the statement: the name on the statement (payee), else its name. */
const statementText = (p: Payable) => (p.payee || p.name).toLowerCase()

/**
 * Active bills charged to a card that are due this month, with their charge on the card's statement: a charge
 * (not a payment or credit) on that card whose description has the name on the statement, by transaction date.
 */
export function cardCharges(wb: Workbook, today: IsoDate): CardCharge[] {
  const month = today.slice(0, 7)
  return wb.payables
    .filter((p) => p.active && p.cardId && payableMonthList(p, month).includes(month))
    .map((p) => {
      const words = statementText(p)
      const lines = wb.lines
        .filter((l) => l.cardId === p.cardId && l.amount > 0 && l.type !== 'payment' && l.type !== 'credit' && l.description.toLowerCase().includes(words))
        .map((l) => ({ line: l, date: l.txnDate || l.postDate || l.statementDate }))
        .sort((a, b) => a.date.localeCompare(b.date))
      return {
        payable: p,
        charged: lines.filter((x) => x.date.startsWith(month)).at(-1)?.line ?? null,
        last: lines.filter((x) => x.date < `${month}-01`).at(-1)?.line ?? null,
      }
    })
}
