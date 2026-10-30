import type { Centavos } from '../lib/money'
import { billFor, nextBill, type Bill } from './billing'
import { summarizeCard } from './dues'
import { reconcileCard } from './reconcile'
import type { Card, IsoDate, Workbook } from './types'

export type NextBillEstimate = {
  card: Card
  bill: Bill
  installments: Centavos
  /** Logged card expenses that land on this bill. */
  spending: Centavos
  /** Unpaid part of the current statement after its due date. */
  carried: Centavos
  /** Rough: carried × monthly rate. The bank's real figure is usually higher (it also charges on new purchases). */
  interest: Centavos
  total: Centavos
}

/** Estimates the card's next statement from the latest statement and the expenses logged since. */
export function estimateNextBill(wb: Workbook, card: Card, today: IsoDate): NextBillEstimate | null {
  const summary = summarizeCard(wb, card, today)
  const latestLineDate = wb.lines
    .filter((l) => l.cardId === card.cardId)
    .reduce<IsoDate | null>((max, l) => (max === null || l.statementDate > max ? l.statementDate : max), null)
  const lastStatement = summary.snapshot?.asOf ?? latestLineDate
  const bill = lastStatement ? nextBill(card, lastStatement) : billFor(card, today)
  if (!bill) return null

  const spending = reconcileCard(wb, card.cardId)
    .unbilled.filter((t) => billFor(card, t.date)?.statementDate === bill.statementDate)
    .reduce((s, t) => s + t.amount, 0)
  const pastDue = summary.snapshot?.dueDate ? summary.snapshot.dueDate < today : false
  const carried = pastDue ? summary.remainingDue : 0
  const interest = Math.round(carried * (card.monthlyRate ?? 0.03))
  const installments = summary.installmentsMonthly
  return { card, bill, installments, spending, carried, interest, total: installments + spending + carried + interest }
}
