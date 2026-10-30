import { describe, expect, it } from 'vitest'
import { formatForBank, parseStatementLine } from './statementParser'

// Made-up lines in the same layout as real statements.
describe('parseStatementLine: Metrobank layout (post date first, no year)', () => {
  it('reads an installment', () => {
    expect(parseStatementLine('10/09 08/09 INSTL 3/6 SAMPLE STORE CITY 2,499.67', 'metrobank', '2030-10-09')).toEqual({
      postDate: '2030-10-09',
      txnDate: '2030-08-09',
      description: 'SAMPLE STORE CITY',
      type: 'installment',
      amount: 249967,
      termNo: 3,
      totalTerms: 6,
    })
  })

  it('reads a payment with the C suffix as a negative payment', () => {
    expect(parseStatementLine('09/29 09/29 CASH PAYMENT - THANK YOU 1,000.00C', 'metrobank', '2030-10-09')).toMatchObject({
      type: 'payment',
      amount: -100000,
    })
  })

  it('uses the previous year for months after the statement month', () => {
    expect(parseStatementLine('12/30 12/29 SAMPLE SHOP, CITY, PHL 99.50', 'metrobank', '2031-01-09')).toMatchObject({
      postDate: '2030-12-30',
      txnDate: '2030-12-29',
      type: 'straight',
    })
  })
})

describe('parseStatementLine: Security Bank layout (purchase date first, with year)', () => {
  it('reads a purchase', () => {
    expect(parseStatementLine('09/04/30 09/06/30 SAMPLE FUEL STATION, CITY 2,335.00', 'security', '2030-10-05')).toEqual({
      postDate: '2030-09-06',
      txnDate: '2030-09-04',
      description: 'SAMPLE FUEL STATION, CITY',
      type: 'straight',
      amount: 233500,
      termNo: null,
      totalTerms: null,
    })
  })

  it('reads an installment with n/m after the description', () => {
    expect(parseStatementLine('09/18/30 09/18/30 SAMPLE ONLINE 2/12 3,484.97', 'security', '2030-10-05')).toMatchObject({
      description: 'SAMPLE ONLINE',
      type: 'installment',
      termNo: 2,
      totalTerms: 12,
      amount: 348497,
    })
  })

  it('reads CR as a credit, and a converted purchase reversal as credit (not payment)', () => {
    expect(parseStatementLine('09/24/30 09/24/30 PAYMENT - PHP 25,000.00 CR', 'security', '2030-10-05')).toMatchObject({ type: 'payment', amount: -2500000 })
    expect(parseStatementLine('10/01/30 10/01/30 SAMPLE AUTO CONVERT 7,690.00 CR', 'security', '2030-10-05')).toMatchObject({ type: 'credit', amount: -769000 })
  })
})

describe('parseStatementLine: other', () => {
  it('detects interest and fees', () => {
    expect(parseStatementLine('10/05 10/05 FINANCE CHARGE 711.09', 'auto', '2030-10-05')?.type).toBe('interest')
    expect(parseStatementLine('10/05 10/05 LATE FEE 500.00', 'auto', '2030-10-05')?.type).toBe('fee')
  })

  it('returns null for text it cannot read', () => {
    expect(parseStatementLine('hello world', 'auto', '2030-10-05')).toBeNull()
  })

  it('picks the format from the bank name', () => {
    expect(formatForBank('Metrobank')).toBe('metrobank')
    expect(formatForBank('Security Bank')).toBe('security')
    expect(formatForBank('BPI')).toBe('auto')
  })
})
