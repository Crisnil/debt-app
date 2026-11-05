import type { SheetUpdate } from '../data/schema'
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
  /** From Cards.credit_limit. null when the cell is empty. */
  creditLimit: Centavos | null
  active: boolean
  /** Sheet row number (1-based) in the Cards tab. */
  row: number
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
  /** Amount the bank requires to stay in the account (not spendable). 0 when none. */
  maintainingBalance: Centavos
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
  /** Set when this expense pays a payable (bill or money owed). */
  payableId?: string
  /** The month (YYYY-MM) of the payable that this expense pays. */
  payableMonth?: string
}

/** A bill or money owed outside the credit cards. Recurring: every month from start_month, `times` times (null = no end). */
export type Payable = {
  payableId: string
  name: string
  payee: string
  category: string
  /** Usual amount per month (recurring) or the amount owed (one-time). */
  amount: Centavos
  recurring: boolean
  /** Day of the month it is due. null = end of the month. */
  dueDay: number | null
  /** YYYY-MM of the first (or only) time. */
  startMonth: string
  times: number | null
  active: boolean
  note: string
  row: number
}

/** One line of the planned monthly expenses (your guide), e.g. Grocery ₱5,000. */
export type PlannedExpense = { itemId: string; name: string; amount: Centavos; active: boolean; row: number }

/** The real amount of a recurring payable for one month, when it differs from the usual amount. */
export type PayableAmount = { payableId: string; month: string; amount: Centavos; createdAt: string }

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

/**
 * ewallet_return: money moved from an e-wallet back to a bank. Not income: it lowers "E-wallet load" spending.
 * gift / repayment: money received from a person (a gift, or money paid back to you). Not part of the plan's income.
 */
export type IncomeType = 'salary' | 'allowance' | 'bonus' | '13th_month' | 'side' | 'other' | 'ewallet_return' | 'gift' | 'repayment'

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
  payables: Payable[]
  payableAmounts: PayableAmount[]
  plannedExpenses: PlannedExpense[]
  /** Tabs and columns the sheet does not have yet (Settings → Update sheet). */
  updates: SheetUpdate[]
}
