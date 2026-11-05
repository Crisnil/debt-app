import type { Centavos } from '../lib/money'
import { daysBetween } from './dues'
import { addMonths } from './payables'
import type { IncomeEntry, IncomeSource, IncomeType, IsoDate, Workbook } from './types'

/** How far back a missed payday is still shown (days). */
export const PAYDAY_LOOKBACK_DAYS = 14
/** A recorded income entry counts for a payday when its date is this close (days), e.g. salary paid a day early. */
export const PAYDAY_MATCH_DAYS = 6

export type Payday = { source: IncomeSource; date: IsoDate; amount: Centavos }

/** The income type to save for a recurring source: allowance or salary. */
export function incomeTypeFor(source: IncomeSource): IncomeType {
  return source.sourceId === 'allowance' ? 'allowance' : 'salary'
}

function dateIn(month: string, day: number): IsoDate {
  const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
  return `${month}-${String(Math.min(day, last)).padStart(2, '0')}`
}

/** Paydays of the active income sources from `from` to `to` (both included), oldest first. */
export function paydaysBetween(wb: Workbook, from: IsoDate, to: IsoDate): Payday[] {
  const result: Payday[] = []
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addMonths(m, 1)) {
    for (const source of wb.incomeSources.filter((s) => s.active)) {
      const days = source.frequency === 'monthly' ? source.days.slice(0, 1) : source.days
      for (const d of days) {
        const date = dateIn(m, d)
        if (date >= from && date <= to) result.push({ source, date, amount: source.amount })
      }
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Paydays in the last two weeks (up to today) without an income entry from that source near the date.
 * Each entry answers one payday. A skipped payday is saved as an entry of 0, so it is answered too.
 */
export function paydaysToRecord(wb: Workbook, today: IsoDate): Payday[] {
  const from = new Date(`${today}T00:00:00`)
  from.setDate(from.getDate() - PAYDAY_LOOKBACK_DAYS)
  const start = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`
  const used = new Set<IncomeEntry>()
  return paydaysBetween(wb, start, today).filter((p) => {
    const entry = wb.incomeLog.find((e) => !used.has(e) && e.sourceId === p.source.sourceId && Math.abs(daysBetween(e.date, p.date)) <= PAYDAY_MATCH_DAYS)
    if (entry) used.add(entry)
    return !entry
  })
}

export type IncomeMonth = { month: string; entries: IncomeEntry[]; total: Centavos }

/** Income received per month, newest first (entries of 0, i.e. skipped paydays, are left out). */
export function incomeByMonth(wb: Workbook, months: number, today: IsoDate): IncomeMonth[] {
  const result: IncomeMonth[] = []
  for (let i = 0; i < months; i++) {
    const month = addMonths(today.slice(0, 7), -i)
    const entries = wb.incomeLog.filter((e) => e.date.startsWith(month) && e.amount > 0).sort((a, b) => b.date.localeCompare(a.date))
    result.push({ month, entries, total: entries.reduce((s, e) => s + e.amount, 0) })
  }
  return result
}
