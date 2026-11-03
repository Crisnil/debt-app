import type { Centavos } from '../lib/money'

/** ISO date string, YYYY-MM-DD. */
export type IsoDate = string

export type Card = {
  cardId: string
  bank: string
  name: string
  sheetTab: string
  statementDay: number | null
  dueDay: number | null
  monthlyRate: number | null
  active: boolean
}

export type CardSnapshot = {
  cardId: string
  asOf: IsoDate
  dueDate: IsoDate
  outstanding: Centavos
  currentDue: Centavos
  minimumDue: Centavos
  interestCharged: Centavos
}

export type Payment = { payId: string; date: IsoDate; cardId: string; amount: Centavos; fromAccount: string }

export type LineType = 'installment' | 'straight' | 'payment' | 'interest' | 'fee' | 'credit'

export type StatementLine = {
  cardId: string
  /** Sheet row number (1-based) in the card's statement tab. 0 for lines not yet in the sheet. */
  row: number
  statementDate: IsoDate
  postDate: IsoDate
  txnDate: IsoDate
  description: string
  type: LineType
  amount: Centavos
  termNo: number | null
  totalTerms: number | null
  category: string
  /** Expense linked by hand (Transactions.txn_id). */
  linkedTxnId: string
}

export type Category = { category: string; weeklyBudget: Centavos; defaultMethod: string }

export type AccountType = 'credit_card' | 'bank' | 'e-wallet' | 'cash'

export type Account = {
  accountId: string
  label: string
  type: AccountType
  cardId: string
  openingBalance: Centavos
  openingDate: IsoDate
  isSavings: boolean
  active: boolean
  row: number
}

/** An expense (spending). Paid with a card or an account. */
export type Transaction = {
  txnId: string
  date: IsoDate
  amount: Centavos
  merchant: string
  category: string
  methodId: string
  note: string
}

/** Money moved between two accounts. Not spending. */
export type Transfer = { transferId: string; date: IsoDate; fromAccount: string; toAccount: string; amount: Centavos; note: string }

export type IncomeSource = {
  sourceId: string
  label: string
  amount: Centavos
  frequency: 'per_payday' | 'monthly'
  days: number[]
  toAccount: string
  inPlan: boolean
  active: boolean
  row: number
}

export type IncomeType = 'salary' | 'allowance' | 'bonus' | '13th_month' | 'side' | 'other'

export type IncomeEntry = {
  incomeId: string
  date: IsoDate
  sourceId: string
  type: IncomeType
  amount: Centavos
  toAccount: string
  note: string
}

export type SettingRow = { value: string; row: number }

export type Workbook = {
  title: string
  /** Header row of each tab, in sheet order. Used to write rows in the right column order. */
  headers: Record<string, string[]>
  settings: Record<string, SettingRow>
  cards: Card[]
  snapshots: CardSnapshot[]
  payments: Payment[]
  lines: StatementLine[]
  categories: Category[]
  accounts: Account[]
  transactions: Transaction[]
  transfers: Transfer[]
  incomeSources: IncomeSource[]
  incomeLog: IncomeEntry[]
}
