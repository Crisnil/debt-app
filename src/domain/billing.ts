import type { Card, IsoDate } from './types'

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate() // month is 1-based
}

function iso(year: number, month: number, day: number): IsoDate {
  const d = Math.min(day, daysInMonth(year, month))
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function nextMonth(year: number, month: number): [number, number] {
  return month === 12 ? [year + 1, 1] : [year, month + 1]
}

export type Bill = { statementDate: IsoDate; dueDate: IsoDate }

/**
 * The bill a card purchase lands on. A purchase on or before the cut-off day goes on that
 * month's statement; after the cut-off it goes on next month's. The due date is in the same
 * month as the statement when due_day > statement_day (e.g. cut-off 9th, due 30th), else in
 * the next month (e.g. cut-off 27th, due 19th). Short months use their last day.
 */
export function billFor(card: Pick<Card, 'statementDay' | 'dueDay'>, date: IsoDate): Bill | null {
  if (!card.statementDay || !card.dueDay) return null
  let [year, month] = date.split('-').map(Number) as [number, number]
  const day = Number(date.slice(8, 10))
  if (day > Math.min(card.statementDay, daysInMonth(year, month))) [year, month] = nextMonth(year, month)
  const statementDate = iso(year, month, card.statementDay)
  const [dy, dm] = card.dueDay > card.statementDay ? [year, month] : nextMonth(year, month)
  return { statementDate, dueDate: iso(dy, dm, card.dueDay) }
}

/** The statement after the given one. */
export function nextBill(card: Pick<Card, 'statementDay' | 'dueDay'>, statementDate: IsoDate): Bill | null {
  const d = new Date(`${statementDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return billFor(card, d.toISOString().slice(0, 10))
}
