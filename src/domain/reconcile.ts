import { cardForMethod } from './accounts'
import { billFor } from './billing'
import { daysBetween } from './dues'
import type { IsoDate, StatementLine, Transaction, Workbook } from './types'

/** A statement line and an expense are the same purchase when the card and amount match and the dates are this close. */
export const MATCH_DAYS = 3
/** Amounts within this share are a "probable" match that needs a confirm (e.g. gas pre-authorization). */
export const PROBABLE_SHARE = 0.01
/** txn_id value that means "this statement line has no logged expense". Stops auto and probable matching. */
export const NO_MATCH = '-'

export type MatchedPair = { line: StatementLine; txn: Transaction; how: 'manual' | 'auto' }

export type Reconciliation = {
  cardId: string
  latestStatement: IsoDate | null
  /** Logged and billed: counted once. */
  matched: MatchedPair[]
  /** Close but not exact. The user confirms or rejects. */
  probable: { line: StatementLine; txn: Transaction }[]
  /** On the statement, not logged, after tracking started: "you forgot to log this". */
  unlogged: StatementLine[]
  /** On the statement before the first logged expense on this card. Counted from the statement, no warning. */
  beforeTracking: StatementLine[]
  /** The user said these lines have no logged expense (txn_id = NO_MATCH). Counted from the statement. */
  acknowledged: StatementLine[]
  /** Logged, should be on a statement that is already in the sheet, but is not. */
  notOnStatement: Transaction[]
  /** Logged after the latest statement: goes on the next bill. */
  unbilled: Transaction[]
}

function lineDate(line: StatementLine): IsoDate {
  return line.txnDate || line.postDate || line.statementDate
}

export function cardExpenses(wb: Workbook, cardId: string): Transaction[] {
  return wb.transactions.filter((t) => cardForMethod(wb, t.methodId)?.cardId === cardId)
}

export function reconcileCard(wb: Workbook, cardId: string): Reconciliation {
  const card = wb.cards.find((c) => c.cardId === cardId)
  const lines = wb.lines.filter((l) => l.cardId === cardId && l.type === 'straight')
  const expenses = cardExpenses(wb, cardId)
  const latestStatement = wb.lines
    .filter((l) => l.cardId === cardId)
    .reduce<IsoDate | null>((max, l) => (max === null || l.statementDate > max ? l.statementDate : max), null)

  const used = new Set<string>()
  const matched: MatchedPair[] = []
  const probable: { line: StatementLine; txn: Transaction }[] = []
  const open: StatementLine[] = []

  // 1. Links made by hand win. NO_MATCH marks a line the user said has no logged expense.
  const rejected: StatementLine[] = []
  for (const line of lines) {
    if (line.linkedTxnId === NO_MATCH) {
      rejected.push(line)
      continue
    }
    const txn = line.linkedTxnId ? expenses.find((t) => t.txnId === line.linkedTxnId && !used.has(t.txnId)) : undefined
    if (txn) {
      used.add(txn.txnId)
      matched.push({ line, txn, how: 'manual' })
    } else open.push(line)
  }

  // 2. Exact amount, closest date first. Lines in date order, so repeated purchases pair in order.
  const pickClosest = (line: StatementLine, ok: (t: Transaction) => boolean) => {
    let best: Transaction | null = null
    let bestGap = Infinity
    for (const t of expenses) {
      if (used.has(t.txnId) || !ok(t)) continue
      const gap = Math.abs(daysBetween(t.date, lineDate(line)))
      if (gap <= MATCH_DAYS && gap < bestGap) {
        best = t
        bestGap = gap
      }
    }
    return best
  }
  const stillOpen: StatementLine[] = []
  for (const line of [...open].sort((a, b) => lineDate(a).localeCompare(lineDate(b)))) {
    const txn = pickClosest(line, (t) => t.amount === line.amount)
    if (txn) {
      used.add(txn.txnId)
      matched.push({ line, txn, how: 'auto' })
    } else stillOpen.push(line)
  }

  // 3. Amount within 1%: ask the user.
  const unmatchedLines: StatementLine[] = []
  for (const line of stillOpen) {
    const txn = pickClosest(line, (t) => Math.abs(t.amount - line.amount) <= Math.abs(line.amount) * PROBABLE_SHARE)
    if (txn) {
      used.add(txn.txnId)
      probable.push({ line, txn })
    } else unmatchedLines.push(line)
  }

  const trackingStart = expenses.reduce<IsoDate | null>((min, t) => (min === null || t.date < min ? t.date : min), null)
  const unlogged = unmatchedLines.filter((l) => trackingStart !== null && lineDate(l) >= trackingStart)
  const beforeTracking = unmatchedLines.filter((l) => trackingStart === null || lineDate(l) < trackingStart)

  const notOnStatement: Transaction[] = []
  const unbilled: Transaction[] = []
  for (const t of expenses) {
    if (used.has(t.txnId)) continue
    const bill = card ? billFor(card, t.date) : null
    if (latestStatement && bill && bill.statementDate <= latestStatement) notOnStatement.push(t)
    else unbilled.push(t)
  }

  return { cardId, latestStatement, matched, probable, unlogged, beforeTracking, acknowledged: rejected, notOnStatement, unbilled }
}

/**
 * One purchase, one count. Card spending = every straight statement line (matched lines use the
 * expense's category) + logged card expenses not on any statement yet. Cash, bank, and e-wallet
 * expenses are always counted from the expense list.
 */
export type SpendingItem = { date: IsoDate; amount: number; category: string; label: string; methodId: string; source: 'expense' | 'statement' | 'both' }

export function spendingItems(wb: Workbook): SpendingItem[] {
  const items: SpendingItem[] = []
  for (const card of wb.cards) {
    const r = reconcileCard(wb, card.cardId)
    for (const { line, txn } of [...r.matched, ...r.probable]) {
      items.push({ date: txn.date, amount: line.amount, category: txn.category || line.category, label: txn.merchant || line.description, methodId: card.cardId, source: 'both' })
    }
    for (const line of [...r.unlogged, ...r.beforeTracking, ...r.acknowledged]) {
      items.push({ date: lineDate(line), amount: line.amount, category: line.category, label: line.description, methodId: card.cardId, source: 'statement' })
    }
    for (const t of [...r.unbilled, ...r.notOnStatement]) {
      items.push({ date: t.date, amount: t.amount, category: t.category, label: t.merchant, methodId: t.methodId, source: 'expense' })
    }
  }
  for (const t of wb.transactions) {
    if (cardForMethod(wb, t.methodId)) continue
    items.push({ date: t.date, amount: t.amount, category: t.category, label: t.merchant, methodId: t.methodId, source: 'expense' })
  }
  return items.sort((a, b) => b.date.localeCompare(a.date))
}
