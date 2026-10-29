import type { Centavos } from '../lib/money'
import type { Card, CardSnapshot, IsoDate, Workbook } from './types'

export type DueStatus = 'paid' | 'due' | 'overdue' | 'no-statement'

export type CardSummary = {
  card: Card
  snapshot: CardSnapshot | null
  paidSinceStatement: Centavos
  remainingDue: Centavos
  status: DueStatus
  daysToDue: number | null
  installmentsMonthly: Centavos
  installmentsRemaining: Centavos
  installmentCount: number
  lastInstallmentMonths: number
}

export type DuesSummary = {
  cards: CardSummary[]
  totalRemainingDue: Centavos
  totalInstallmentsMonthly: Centavos
  totalInstallmentsRemaining: Centavos
}

const DAY = 86_400_000

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY)
}

function latest<T>(items: T[], key: (item: T) => string): T | null {
  return items.reduce<T | null>((best, item) => (best === null || key(item) > key(best) ? item : best), null)
}

export function summarizeCard(workbook: Workbook, card: Card, today: IsoDate): CardSummary {
  const snapshot = latest(
    workbook.snapshots.filter((s) => s.cardId === card.cardId),
    (s) => s.asOf,
  )
  const paidSinceStatement = snapshot
    ? workbook.payments
        .filter((p) => p.cardId === card.cardId && p.date >= snapshot.asOf)
        .reduce((sum, p) => sum + p.amount, 0)
    : 0
  const remainingDue = snapshot ? Math.max(snapshot.currentDue - paidSinceStatement, 0) : 0
  const daysToDue = snapshot?.dueDate ? daysBetween(today, snapshot.dueDate) : null
  let status: DueStatus = 'no-statement'
  if (snapshot) {
    if (remainingDue === 0) status = 'paid'
    else if (daysToDue !== null && daysToDue < 0) status = 'overdue'
    else status = 'due'
  }

  // Installments: lines of the latest statement for this card.
  const cardLines = workbook.lines.filter((l) => l.cardId === card.cardId)
  const lastStatement = latest(cardLines, (l) => l.statementDate)?.statementDate
  const installments = cardLines.filter(
    (l) => l.statementDate === lastStatement && l.type === 'installment' && l.termNo !== null && l.totalTerms !== null,
  )
  const monthsLeft = (l: (typeof installments)[number]) => Math.max((l.totalTerms ?? 0) - (l.termNo ?? 0), 0)

  return {
    card,
    snapshot,
    paidSinceStatement,
    remainingDue,
    status,
    daysToDue,
    installmentsMonthly: installments.filter((l) => monthsLeft(l) > 0).reduce((s, l) => s + l.amount, 0),
    installmentsRemaining: installments.reduce((s, l) => s + l.amount * monthsLeft(l), 0),
    installmentCount: installments.filter((l) => monthsLeft(l) > 0).length,
    lastInstallmentMonths: installments.reduce((m, l) => Math.max(m, monthsLeft(l)), 0),
  }
}

export function summarizeDues(workbook: Workbook, today: IsoDate): DuesSummary {
  const cards = workbook.cards
    .filter((c) => c.active)
    .map((c) => summarizeCard(workbook, c, today))
    .sort((a, b) => (a.daysToDue ?? Infinity) - (b.daysToDue ?? Infinity))
  return {
    cards,
    totalRemainingDue: cards.reduce((s, c) => s + c.remainingDue, 0),
    totalInstallmentsMonthly: cards.reduce((s, c) => s + c.installmentsMonthly, 0),
    totalInstallmentsRemaining: cards.reduce((s, c) => s + c.installmentsRemaining, 0),
  }
}

export function todayIso(now = new Date()): IsoDate {
  // Local date, not UTC: a payment at 7 AM in Manila must count for today.
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
