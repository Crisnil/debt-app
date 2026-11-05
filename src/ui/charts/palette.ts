import type { Health } from '../../domain/health'

// Chart colors. Checked with the dataviz palette validator (light surface): the first three slots pass
// color-blind separation for every pair. Slot 3 (aqua) is below 3:1 contrast, so every chart that uses
// these colors also has a legend and a table view. Colors follow the card (its order in the Cards tab), never its rank.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']

export const seriesColor = (index: number) => SERIES[index % SERIES.length]

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
