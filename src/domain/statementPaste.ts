import { nextBill } from './billing'
import { daysBetween, todayIso } from './dues'
import { MATCH_DAYS, reconcileCard } from './reconcile'
import { formatForBank, parseStatementLine, type ParsedLine } from './statementParser'
import type { Card, IsoDate, Transaction, Workbook } from './types'

export type PastedRow = {
  raw: string
  /** null: the line is not in a known format (a header, a total, or a wrapped line). */
  line: ParsedLine | null
  /** The same line is already in the sheet, for example when the block is pasted twice. */
  duplicate: boolean
  /** Logged expenses on this card with the exact amount, ±3 days, not matched yet. Closest date first. Purchases only. */
  candidates: Transaction[]
  /** The expense to link when only one candidate fits and no earlier row took it. '' = the user picks. */
  suggested: string
}

/** Reads a block pasted from a billing statement, one row per non-empty line, and suggests the matching expenses. */
export function readStatementBlock(wb: Workbook, cardId: string, raw: string, statementDate: IsoDate): PastedRow[] {
  const card = wb.cards.find((c) => c.cardId === cardId)
  const format = formatForBank(card?.bank ?? '')
  const existing = wb.lines.filter((l) => l.cardId === cardId)
  const r = reconcileCard(wb, cardId)
  const open = [...r.notOnStatement, ...r.unbilled]
  const taken = new Set<string>()

  return raw
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => {
      const line = parseStatementLine(text, format, statementDate)
      if (!line) return { raw: text, line, duplicate: false, candidates: [], suggested: '' }
      const duplicate = existing.some(
        (l) => l.postDate === line.postDate && l.txnDate === line.txnDate && l.amount === line.amount && l.description === line.description,
      )
      const date = line.txnDate || line.postDate
      const candidates =
        line.type === 'straight' && !duplicate
          ? open
              .filter((t) => t.amount === line.amount && Math.abs(daysBetween(t.date, date)) <= MATCH_DAYS)
              .sort((a, b) => Math.abs(daysBetween(a.date, date)) - Math.abs(daysBetween(b.date, date)))
          : []
      const free = candidates.filter((t) => !taken.has(t.txnId))
      const suggested = candidates.length === 1 && free.length === 1 ? free[0].txnId : ''
      if (suggested) taken.add(suggested)
      return { raw: text, line, duplicate, candidates, suggested }
    })
}

/** Cut-off date of the statement after the latest one in the sheet. Today when the card has no statement lines yet. */
export function nextStatementDate(wb: Workbook, card: Card): IsoDate {
  const latest = wb.lines.filter((l) => l.cardId === card.cardId).reduce((max, l) => (l.statementDate > max ? l.statementDate : max), '')
  return (latest && nextBill(card, latest)?.statementDate) || todayIso()
}
