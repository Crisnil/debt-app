/**
 * Money is stored as integer centavos inside the app to avoid floating-point errors.
 * The sheet stores pesos with 2 decimals; convert at the boundary.
 */
export type Centavos = number

const pesoFormat = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Parses "1,234.56", "₱1,234.56", "2,000.00C", "2,000.00 CR", or a number into centavos. Credits are negative. */
export function toCentavos(value: string | number): Centavos {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Invalid amount: ${value}`)
    return Math.round(value * 100)
  }
  const trimmed = value.trim().toUpperCase()
  const isCredit = /\d\s*(C|CR)$/.test(trimmed) || trimmed.startsWith('-')
  const digits = trimmed.replace(/(CR|C)$/, '').replace(/[₱,\s-]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(digits)) throw new Error(`Invalid amount: ${value}`)
  const [whole, fraction = ''] = digits.split('.')
  const centavos = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return isCredit ? -centavos : centavos
}

export function toPesos(centavos: Centavos): number {
  return centavos / 100
}

export function formatPeso(centavos: Centavos): string {
  return pesoFormat.format(centavos / 100)
}
