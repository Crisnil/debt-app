import { toCentavos, type Centavos } from '../lib/money'
import type { IsoDate, LineType } from './types'

export type ParsedLine = {
  postDate: IsoDate
  txnDate: IsoDate
  description: string
  type: LineType
  amount: Centavos
  termNo: number | null
  totalTerms: number | null
}

export type BankFormat = 'metrobank' | 'security' | 'auto'

/** MM/DD with no year: use the statement year, or the year before when the month is after the statement month. */
function withYear(md: string, statementDate: IsoDate): IsoDate {
  const [m, d] = md.split('/').map(Number)
  const sy = Number(statementDate.slice(0, 4))
  const sm = Number(statementDate.slice(5, 7))
  const year = m > sm ? sy - 1 : sy
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function fromMdy(mdy: string): IsoDate {
  const [m, d, y] = mdy.split('/').map(Number)
  return `${y < 100 ? 2000 + y : y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function lineType(description: string, isCredit: boolean, hasTerms: boolean): LineType {
  if (isCredit) return /PAYMENT/i.test(description) ? 'payment' : 'credit'
  if (hasTerms) return 'installment'
  if (/INTEREST|FINANCE CHARGE/i.test(description)) return 'interest'
  if (/\bFEE\b|LATE CHARGE|ANNUAL/i.test(description)) return 'fee'
  return 'straight'
}

function build(post: IsoDate, txn: IsoDate, desc: string, n: string | undefined, m: string | undefined, amount: string, credit: boolean): ParsedLine {
  const value = toCentavos(amount)
  return {
    postDate: post,
    txnDate: txn,
    description: desc.trim(),
    type: lineType(desc, credit, Boolean(n && m)),
    amount: credit ? -value : value,
    termNo: n ? Number(n) : null,
    totalTerms: m ? Number(m) : null,
  }
}

// Metrobank: "<post MM/DD> <purchase MM/DD> [INSTL n/m] <description> <amount>[C]"
const METROBANK = /^(\d{2}\/\d{2})\s+(\d{2}\/\d{2})\s+(?:INSTL\s+(\d+)\/(\d+)\s+)?(.+?)\s+([\d,]+\.\d{2})\s*(C|CR)?$/i
// Security Bank: "<purchase MM/DD/YY> <post MM/DD/YY> <description> [n/m] <amount>[ CR]"
const SECURITY = /^(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+(.+?)(?:\s+(\d+)\/(\d+))?\s+([\d,]+\.\d{2})\s*(CR|C)?$/i

/** Reads one pasted statement line. Returns null when the format is not known; the user then fills the form. */
export function parseStatementLine(raw: string, format: BankFormat, statementDate: IsoDate): ParsedLine | null {
  const line = raw.trim().replace(/\s+/g, ' ')
  if (format !== 'security') {
    const m = line.match(METROBANK)
    if (m) return build(withYear(m[1], statementDate), withYear(m[2], statementDate), m[5], m[3], m[4], m[6], Boolean(m[7]))
  }
  if (format !== 'metrobank') {
    const m = line.match(SECURITY)
    if (m) return build(fromMdy(m[2]), fromMdy(m[1]), m[3], m[4], m[5], m[6], Boolean(m[7]))
  }
  return null
}

export function formatForBank(bank: string): BankFormat {
  if (/metro/i.test(bank)) return 'metrobank'
  if (/security/i.test(bank)) return 'security'
  return 'auto'
}
