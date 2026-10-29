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

export type Payment = { date: IsoDate; cardId: string; amount: Centavos }

export type LineType = 'installment' | 'straight' | 'payment' | 'interest' | 'fee' | 'credit'

export type StatementLine = {
  cardId: string
  statementDate: IsoDate
  postDate: IsoDate
  txnDate: IsoDate
  description: string
  type: LineType
  amount: Centavos
  termNo: number | null
  totalTerms: number | null
  category: string
}

export type Category = { category: string; weeklyBudget: Centavos; defaultMethod: string }

export type PaymentMethod = { methodId: string; label: string; type: string; active: boolean }

export type Transaction = {
  txnId: string
  date: IsoDate
  amount: Centavos
  merchant: string
  category: string
  methodId: string
}

export type Workbook = {
  title: string
  settings: Record<string, string>
  cards: Card[]
  snapshots: CardSnapshot[]
  payments: Payment[]
  lines: StatementLine[]
  categories: Category[]
  paymentMethods: PaymentMethod[]
  transactions: Transaction[]
}
