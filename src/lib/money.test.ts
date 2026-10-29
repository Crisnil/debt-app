import { describe, expect, it } from 'vitest'
import { formatPeso, toCentavos, toPesos } from './money'

describe('toCentavos', () => {
  it.each([
    ['1,234.56', 123456],
    ['₱1,234.56', 123456],
    ['500', 50000],
    ['0.5', 50],
    [' 99.90 ', 9990],
    ['2,000.00C', -200000],
    ['2,000.00 CR', -200000],
    ['-150.25', -15025],
  ])('parses %s', (input, expected) => {
    expect(toCentavos(input)).toBe(expected)
  })

  it('rounds numbers to the nearest centavo', () => {
    expect(toCentavos(0.1 + 0.2)).toBe(30)
    expect(toCentavos(1234.565)).toBe(123457)
  })

  it.each(['', 'abc', '1.234', '12..5'])('rejects %s', (input) => {
    expect(() => toCentavos(input)).toThrow()
  })

  it('keeps sums exact', () => {
    const total = ['100.10', '200.20', '300.30'].map(toCentavos).reduce((a, b) => a + b, 0)
    expect(total).toBe(60060)
    expect(toPesos(total)).toBe(600.6)
  })
})

describe('formatPeso', () => {
  it('formats with the peso sign and 2 decimals', () => {
    expect(formatPeso(123456)).toBe('₱1,234.56')
    expect(formatPeso(-200000)).toBe('-₱2,000.00')
  })
})
