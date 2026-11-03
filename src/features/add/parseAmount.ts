import { toCentavos, type Centavos } from '../../lib/money'

/** Reads a positive amount typed by the user. Returns null when it is empty, not a number, or zero. */
export function parsePositiveAmount(input: string): Centavos | null {
  try {
    const value = toCentavos(input)
    return value > 0 ? value : null
  } catch {
    return null
  }
}
