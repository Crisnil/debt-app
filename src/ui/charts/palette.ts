import { PAYABLES } from '../../domain/forecast'
import type { Health } from '../../domain/health'
import type { Workbook } from '../../domain/types'

// Chart colors. Checked with the dataviz palette validator (light surface): every color-blind check passes for
// neighbors, and the first three slots pass for every pair. Aqua, yellow, and pink are below 3:1 contrast on white,
// so every chart that uses these colors also has a legend and a table view.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']

/** Cards and money accounts use slots 0–6, by their row in the sheet (inactive rows too), so a color never moves. */
export const SERIES_SLOTS = 7
/** The 8th color is kept for Bills & payables. */
export const PAYABLES_COLOR = SERIES[7]
/** Gray for "Other": everything after the 7 slots, together. Never a new hue. */
export const OTHER_COLOR = '#94a3b8'

/** Color of a slot. A slot past the 7 colors (or -1, not found) is Other. Colors never repeat. */
export const slotColor = (slot: number) => (slot >= 0 && slot < SERIES_SLOTS ? SERIES[slot] : OTHER_COLOR)

/** A card's color by its row in the Cards tab. Bills & payables have their own color. */
export const cardColor = (wb: Workbook, cardId: string) => (cardId === PAYABLES ? PAYABLES_COLOR : slotColor(wb.cards.findIndex((c) => c.cardId === cardId)))

/** A money account's color by its row in the Accounts tab (credit cards not counted). */
export const accountColor = (wb: Workbook, accountId: string) =>
  slotColor(wb.accounts.filter((a) => a.type !== 'credit_card').findIndex((a) => a.accountId === accountId))

// What we still owe and savings (payoff chart, Home bar). Validator: passes every check, also for color blindness.
// Not the status red and green: those two look alike to many color-blind people.
export const OWED_COLOR = SERIES[1]
export const SAVED_COLOR = SERIES[0]

// Status colors (good / watch / careful / bad = green / yellow / orange / red). Never used for a series.
// Always shown with an icon and a word, so the meaning does not depend on color.
export const STATUS: Record<Health, { fill: string; track: string; icon: string }> = {
  good: { fill: '#0ca30c', track: '#dcf1dc', icon: '✓' },
  watch: { fill: '#fab219', track: '#fdf0cf', icon: '!' },
  careful: { fill: '#ec835a', track: '#fbe3d9', icon: '▲' },
  bad: { fill: '#d03b3b', track: '#f6dada', icon: '▲' },
}

/** Words for credit used on one card. */
export const USED_WORD: Record<Health, string> = { good: 'Low', watch: 'Medium', careful: 'High', bad: 'Very high' }

/** "Nov 2026" from "2026-11". */
export function monthLabel(month: string, withYear = true): string {
  const date = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)
  return date.toLocaleString('en-PH', withYear ? { month: 'short', year: 'numeric' } : { month: 'short' })
}

/** Short peso amount for axes and labels: ₱84k, ₱1.2M. */
export function shortPeso(centavos: number): string {
  const pesos = centavos / 100
  if (Math.abs(pesos) >= 1_000_000) return `₱${(pesos / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (Math.abs(pesos) >= 1_000) return `₱${Math.round(pesos / 1_000)}k`
  return `₱${Math.round(pesos)}`
}

/** A clean axis step (1, 2, 2.5, 5 × 10^n) so that about `count` steps cover `max`. */
export function niceStep(max: number, count = 4): number {
  if (max <= 0) return 1
  const raw = max / count
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].find((s) => s * power >= raw) ?? 10
  return step * power
}
