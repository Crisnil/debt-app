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

export type ReadLine = { raw: string; line: ParsedLine | null }

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
// Bank website list: "Oct 31, 2026", then the description, then "- PHP 3,200.00" (charge) or "+ PHP 30,000.00" (credit).
const WEB_DATE = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})$/
const WEB_AMOUNT = /^([+-])\s*PHP\s*([\d,]+\.\d{2})$/i
// Installments on the website are two lines: "<name> n/m PRIN" and "<name> n/m INT".
const WEB_INSTALLMENT = /^(.+?)\s+(\d+)\/(\d+)\s+(PRIN|INT)$/i

function webDate(m: RegExpMatchArray): IsoDate | null {
  const month = MONTHS.indexOf(m[1].toLowerCase()) + 1
  return month ? `${m[3]}-${String(month).padStart(2, '0')}-${m[2].padStart(2, '0')}` : null
}

/** Reads the bank website layout. Installment principal and interest of the same plan and date become one line. */
function parseWebsiteBlock(lines: string[]): ReadLine[] {
  const out: ReadLine[] = []
  // Which halves (PRIN, INT) each installment line already has.
  const parts = new Map<ReadLine, Set<string>>()
  let date: IsoDate | null = null
  let start = ''
  let desc: string[] = []
  const flush = () => {
    if (date) out.push({ raw: [start, ...desc].join(' '), line: null })
    date = null
    desc = []
  }
  for (const text of lines) {
    const d = text.match(WEB_DATE)
    if (d) {
      flush()
      date = webDate(d)
      start = text
      if (!date) out.push({ raw: text, line: null })
      continue
    }
    const a = text.match(WEB_AMOUNT)
    if (a && date) {
      const description = desc.join(' ')
      const credit = a[1] === '+'
      const raw = [start, ...desc, text].join(' ')
      const inst = description.match(WEB_INSTALLMENT)
      if (inst && !credit) {
        const [, name, n, m] = inst
        const part = inst[4].toUpperCase()
        // The other half (PRIN or INT) of the same plan and date is already read: add to it.
        const plan = out.find(
          (r) =>
            parts.has(r) &&
            r.line?.txnDate === date &&
            r.line.description === name.trim() &&
            r.line.termNo === Number(n) &&
            r.line.totalTerms === Number(m) &&
            !parts.get(r)!.has(part),
        )
        if (plan?.line) {
          plan.line.amount += toCentavos(a[2])
          plan.raw += ` / ${raw}`
          parts.get(plan)!.add(part)
        } else {
          const row = { raw, line: build(date, date, name, n, m, a[2], false) }
          out.push(row)
          parts.set(row, new Set([part]))
        }
      } else out.push({ raw, line: build(date, date, description, undefined, undefined, a[2], credit) })
      date = null
      desc = []
      continue
    }
    if (date) desc.push(text)
    else out.push({ raw: text, line: null })
  }
  flush()
  return out
}

/**
 * Reads a pasted block: the bank website list (date, description, and amount on separate lines),
 * or one statement line per line (PDF layout). Lines that are not transactions come back with line = null.
 */
export function parseStatementText(raw: string, format: BankFormat, statementDate: IsoDate): ReadLine[] {
  const lines = raw
    .split(/\r?\n/)
    .map((t) => t.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
  if (lines.some((t) => WEB_DATE.test(t)) && lines.some((t) => WEB_AMOUNT.test(t))) return parseWebsiteBlock(lines)
  return lines.map((text) => ({ raw: text, line: parseStatementLine(text, format, statementDate) }))
}
