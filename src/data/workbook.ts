import type { AccountType, CardSnapshot, IncomeType, LineType, StatementLine, Workbook } from '../domain/types'
import { getSheetMeta, getTabValues, type TabValues } from '../google/sheetsApi'
import { bool, dayList, int, isoDate, money, num, rowsToObjects, text } from './cells'
import { checkHeaders, checkTabs, STATEMENT_TAB_HEADERS, TABS, type SchemaProblem, type TabName } from './schema'

const LINE_TYPES = new Set<LineType>(['installment', 'straight', 'payment', 'interest', 'fee', 'credit'])
const ACCOUNT_TYPES = new Set<AccountType>(['credit_card', 'bank', 'e-wallet', 'cash'])
const INCOME_TYPES = new Set<IncomeType>(['salary', 'allowance', 'bonus', '13th_month', 'side', 'other'])

export class SchemaError extends Error {
  readonly problems: SchemaProblem[]
  constructor(problems: SchemaProblem[]) {
    super(problems.map((p) => p.message).join(' '))
    this.problems = problems
  }
}

const FIXED_TABS = Object.keys(TABS) as TabName[]

/** Converts raw tab values to a typed workbook. Throws SchemaError if tabs or headers are missing. */
export function parseWorkbook(title: string, availableTabs: readonly string[], values: TabValues): Workbook {
  const problems: SchemaProblem[] = [...checkTabs(availableTabs, FIXED_TABS)]
  for (const tab of FIXED_TABS) {
    if (availableTabs.includes(tab)) problems.push(...checkHeaders(tab, values[tab]?.[0], TABS[tab]))
  }
  if (problems.length) throw new SchemaError(problems)

  const headers: Record<string, string[]> = {}
  for (const [tab, rows] of Object.entries(values)) headers[tab] = (rows[0] ?? []).map((h) => String(h).trim())

  const settings = Object.fromEntries(
    rowsToObjects(values.Settings).map((r) => [text(r.key), { value: text(r.value), row: r.__row }]),
  )

  const cards = rowsToObjects(values.Cards)
    .filter((r) => text(r.card_id))
    .map((r) => ({
      cardId: text(r.card_id),
      bank: text(r.bank),
      name: text(r.name) || text(r.card_id),
      sheetTab: text(r.sheet_tab),
      statementDay: int(r.statement_day),
      dueDay: int(r.due_day),
      monthlyRate: num(r.monthly_rate),
      active: text(r.status).toLowerCase() !== 'closed',
    }))

  const statementProblems: SchemaProblem[] = []
  const lines: StatementLine[] = []
  for (const card of cards) {
    if (!card.sheetTab) continue
    if (!availableTabs.includes(card.sheetTab)) {
      statementProblems.push({ tab: card.sheetTab, message: `Tab "${card.sheetTab}" for card "${card.name}" is missing.` })
      continue
    }
    const tab = values[card.sheetTab] ?? []
    statementProblems.push(...checkHeaders(card.sheetTab, tab[0], STATEMENT_TAB_HEADERS))
    for (const r of rowsToObjects(tab)) {
      const type = text(r.type).toLowerCase() as LineType
      if (!LINE_TYPES.has(type)) continue
      lines.push({
        cardId: card.cardId,
        row: r.__row,
        statementDate: isoDate(r.statement_date),
        postDate: isoDate(r.post_date),
        txnDate: isoDate(r.txn_date),
        description: text(r.description),
        type,
        amount: money(r.amount),
        termNo: int(r.term_no),
        totalTerms: int(r.total_terms),
        category: text(r.category),
        linkedTxnId: text(r.txn_id),
      })
    }
  }
  if (statementProblems.length) throw new SchemaError(statementProblems)

  const snapshots: CardSnapshot[] = rowsToObjects(values.CardSnapshots)
    .filter((r) => text(r.card_id) && isoDate(r.as_of))
    .map((r) => ({
      cardId: text(r.card_id),
      asOf: isoDate(r.as_of),
      dueDate: isoDate(r.due_date),
      outstanding: money(r.outstanding_balance),
      currentDue: money(r.current_due),
      minimumDue: money(r.minimum_due),
      interestCharged: money(r.interest_charged),
    }))

  return {
    title,
    headers,
    settings,
    cards,
    snapshots,
    lines,
    payments: rowsToObjects(values.Payments)
      .filter((r) => text(r.card_id) && isoDate(r.date))
      .map((r) => ({
        payId: text(r.pay_id),
        date: isoDate(r.date),
        cardId: text(r.card_id),
        amount: money(r.amount),
        fromAccount: text(r.from_account),
      })),
    categories: rowsToObjects(values.Categories)
      .filter((r) => text(r.category))
      .map((r) => ({ category: text(r.category), weeklyBudget: money(r.weekly_budget), defaultMethod: text(r.default_method) })),
    accounts: rowsToObjects(values.Accounts)
      .filter((r) => text(r.account_id))
      .map((r) => {
        const type = text(r.type).toLowerCase() as AccountType
        return {
          accountId: text(r.account_id),
          label: text(r.label) || text(r.account_id),
          type: ACCOUNT_TYPES.has(type) ? type : 'bank',
          cardId: text(r.card_id),
          openingBalance: money(r.opening_balance),
          openingDate: isoDate(r.opening_date),
          isSavings: bool(r.is_savings),
          active: bool(r.active),
          row: r.__row,
        }
      }),
    transactions: rowsToObjects(values.Transactions)
      .filter((r) => isoDate(r.date))
      .map((r) => ({
        txnId: text(r.txn_id),
        date: isoDate(r.date),
        amount: money(r.amount),
        merchant: text(r.merchant),
        category: text(r.category),
        methodId: text(r.method_id),
        note: text(r.note),
      })),
    transfers: rowsToObjects(values.Transfers)
      .filter((r) => isoDate(r.date) && text(r.from_account) && text(r.to_account))
      .map((r) => ({
        transferId: text(r.transfer_id),
        date: isoDate(r.date),
        fromAccount: text(r.from_account),
        toAccount: text(r.to_account),
        amount: money(r.amount),
        note: text(r.note),
      })),
    incomeSources: rowsToObjects(values.Income)
      .filter((r) => text(r.source_id))
      .map((r) => ({
        sourceId: text(r.source_id),
        label: text(r.label) || text(r.source_id),
        amount: money(r.amount),
        frequency: text(r.frequency) === 'monthly' ? 'monthly' : 'per_payday',
        days: dayList(r.days),
        toAccount: text(r.to_account),
        inPlan: bool(r.in_plan),
        active: bool(r.active),
        row: r.__row,
      })),
    incomeLog: rowsToObjects(values.IncomeLog)
      .filter((r) => isoDate(r.date))
      .map((r) => {
        const type = text(r.type) as IncomeType
        return {
          incomeId: text(r.income_id),
          date: isoDate(r.date),
          sourceId: text(r.source_id),
          type: INCOME_TYPES.has(type) ? type : 'other',
          amount: money(r.amount),
          toAccount: text(r.to_account),
          note: text(r.note),
        }
      }),
  }
}

/** Reads every tab the app needs in three requests: metadata, fixed tabs, then the card statement tabs. */
export async function loadWorkbook(sheetId: string, token: string): Promise<Workbook> {
  const meta = await getSheetMeta(sheetId, token)
  const fixed = FIXED_TABS.filter((t) => meta.tabs.includes(t))
  const first = await getTabValues(sheetId, fixed, token)
  const cardTabs = rowsToObjects(first.Cards ?? [])
    .map((r) => text(r.sheet_tab))
    .filter((t) => t && meta.tabs.includes(t))
  const statements = cardTabs.length ? await getTabValues(sheetId, cardTabs, token) : {}
  return parseWorkbook(meta.title, meta.tabs, { ...first, ...statements })
}
