import { describe, expect, it } from 'vitest'
import { formatForBank, parseStatementLine, parseStatementText } from './statementParser'

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

// Made-up block in the same layout as the bank website transaction list.
const WEBSITE = `Transaction Date
Description        Transaction Amount
Mar 31, 2030
SAMPLE TIRES CITY PHL
- PHP 1,000.00
Mar 30, 2030
SAMPLE MALL 2/12 PRIN
- PHP 500.50
Mar 30, 2030
SAMPLE MALL 2/12 INT
- PHP 99.50
Mar 19, 2030
PAYMENT - PHP/SBC1
+ PHP 5,000.00
Mar 13, 2030
SAMPLE STORE 10/12 PRIN
- PHP 300.00
Mar 13, 2030
SAMPLE STORE 10/12 INT
- PHP 20.00
Mar 09, 2030
SAMPLE STORE 10/12 PRIN
- PHP 100.00
Mar 09, 2030
SAMPLE STORE 10/12 INT
- PHP 5.25`

describe('parseStatementText: bank website layout', () => {
  const rows = parseStatementText(WEBSITE, 'security', '2030-04-05')
  const lines = rows.flatMap((r) => (r.line ? [r.line] : []))

  it('skips the header lines', () => {
    expect(rows.filter((r) => !r.line).map((r) => r.raw)).toEqual(['Transaction Date', 'Description Transaction Amount'])
  })

  it('reads a purchase with one date for purchase and post', () => {
    expect(lines[0]).toEqual({
      postDate: '2030-03-31',
      txnDate: '2030-03-31',
      description: 'SAMPLE TIRES CITY PHL',
      type: 'straight',
      amount: 100000,
      termNo: null,
      totalTerms: null,
    })
  })

  it('adds installment principal and interest into one installment line', () => {
    expect(lines.filter((l) => l.type === 'installment').map((l) => [l.txnDate, l.description, l.termNo, l.totalTerms, l.amount])).toEqual([
      ['2030-03-30', 'SAMPLE MALL', 2, 12, 60000],
      ['2030-03-13', 'SAMPLE STORE', 10, 12, 32000],
      ['2030-03-09', 'SAMPLE STORE', 10, 12, 10525],
    ])
  })

  it('reads + PHP as a credit and PAYMENT as a payment', () => {
    expect(lines.find((l) => l.type === 'payment')).toMatchObject({ txnDate: '2030-03-19', amount: -500000 })
  })

  it('keeps reading one line per transaction for the PDF layout', () => {
    const [row] = parseStatementText('03/31/30 04/01/30 SAMPLE SHOP 99.50', 'security', '2030-04-05')
    expect(row.line).toMatchObject({ txnDate: '2030-03-31', amount: 9950 })
  })
})

// Made-up block in the same layout as the Metrobank website transaction list (tabs between columns).
const METROBANK_WEB = [
  'CASH PAYMENT - THANK YOU - MB\tMar 30, 2030 12:00:00 AM\tMar 30, 2030 12:00:00 AM\t1000000001\t',
  'PHP (5,000.00)',
  'SAMPLE PHARMACY, CITY, PHL\tMar 25, 2030 12:00:00 AM\tMar 26, 2030 12:00:00 AM\t1000000002\t',
  'PHP 950.75',
  'INSTL 3/3 SAMPLE STORE 1% AT 3M\tJan 27, 2030 12:00:00 AM\tMar 27, 2030 12:00:00 AM\t1000000003',
  'PHP 1,300.01',
  'SAMPLE MART, CITY\tMar 10, 2030\tMar 11, 2030',
  '1000000004',
  'PHP 99.50',
].join('\n')

describe('parseStatementText: Metrobank website layout', () => {
  const rows = parseStatementText(METROBANK_WEB, 'metrobank', '2030-04-09')
  const lines = rows.flatMap((r) => (r.line ? [r.line] : []))

  it('reads every transaction and skips nothing', () => {
    expect(rows.every((r) => r.line)).toBe(true)
    expect(lines).toHaveLength(4)
  })

  it('reads the purchase date first and the post date second', () => {
    expect(lines[1]).toEqual({
      postDate: '2030-03-26',
      txnDate: '2030-03-25',
      description: 'SAMPLE PHARMACY, CITY, PHL',
      type: 'straight',
      amount: 95075,
      termNo: null,
      totalTerms: null,
    })
  })

  it('reads an amount in brackets as a credit, and PAYMENT as a payment', () => {
    expect(lines[0]).toMatchObject({ type: 'payment', amount: -500000, txnDate: '2030-03-30' })
  })

  it('reads INSTL n/m as an installment with the original purchase date', () => {
    expect(lines[2]).toMatchObject({ type: 'installment', description: 'SAMPLE STORE 1% AT 3M', termNo: 3, totalTerms: 3, txnDate: '2030-01-27', postDate: '2030-03-27', amount: 130001 })
  })

  it('accepts lines without times and a reference number on its own line', () => {
    expect(lines[3]).toMatchObject({ txnDate: '2030-03-10', postDate: '2030-03-11', amount: 9950 })
  })
})
