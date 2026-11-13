import type { AccountType, CardSnapshot, IncomeType, LineType, StatementLine, Workbook } from '../domain/types'
import { getSheetMeta, getTabValues, type TabValues } from '../google/sheetsApi'
import { bool, dayList, int, isoDate, money, num, rowsToObjects, text, yearMonth } from './cells'
import { checkHeaders, checkTabs, OPTIONAL_TABS, sheetUpdates, STATEMENT_TAB_HEADERS, TABS, type SchemaProblem, type TabName } from './schema'

const LINE_TYPES = new Set<LineType>(['installment', 'straight', 'payment', 'interest', 'fee', 'credit'])
const ACCOUNT_TYPES = new Set<AccountType>(['credit_card', 'bank', 'e-wallet', 'cash'])
const INCOME_TYPES = new Set<IncomeType>(['salary', 'allowance', 'bonus', '13th_month', 'side', 'other', 'ewallet_return', 'gift', 'repayment'])

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
      creditLimit: text(r.credit_limit) ? money(r.credit_limit) : null,
      active: text(r.status).toLowerCase() !== 'closed',
      row: r.__row,
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
      // A voided line (pasted twice, or read wrong) stays in the sheet; the app ignores it.
      if (!LINE_TYPES.has(type) || text(r.voided_at)) continue
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

  // Optional tabs: read only the ones that have the right header row.
  const optional = (tab: keyof typeof OPTIONAL_TABS) =>
    availableTabs.includes(tab) && checkHeaders(tab, values[tab]?.[0], OPTIONAL_TABS[tab]).length === 0 ? rowsToObjects(values[tab]) : []
  const payables = optional('Payables')
    .filter((r) => text(r.payable_id) && text(r.name))
    .map((r) => ({
      payableId: text(r.payable_id),
      name: text(r.name),
      payee: text(r.payee),
      category: text(r.category),
      amount: money(r.amount),
      recurring: bool(r.recurring),
      dueDay: int(r.due_day),
      startMonth: yearMonth(r.start_month),
      times: int(r.times),
      active: text(r.active) === '' ? true : bool(r.active),
      note: text(r.note),
      cardId: text(r.card_id),
      row: r.__row,
    }))
  const payableAmounts = optional('PayableAmounts')
    .filter((r) => text(r.payable_id) && text(r.month))
    .map((r) => ({ payableId: text(r.payable_id), month: yearMonth(r.month), amount: money(r.amount), createdAt: text(r.created_at) }))
  const plannedExpenses = optional('PlannedExpenses')
    .filter((r) => text(r.item_id) && text(r.name))
    .map((r) => ({ itemId: text(r.item_id), name: text(r.name), amount: money(r.amount), active: text(r.active) === '' ? true : bool(r.active), payableId: text(r.payable_id), row: r.__row }))
  const balanceChecks = optional('BalanceChecks')
    // A voided check stays in the sheet with voided_at set; the app ignores it.
    .filter((r) => text(r.check_id) && text(r.account_id) && isoDate(r.date) && !text(r.voided_at))
    .map((r) => ({
      checkId: text(r.check_id),
      createdAt: text(r.created_at),
      date: isoDate(r.date),
      accountId: text(r.account_id),
      balance: money(r.balance),
      countDifference: text(r.count_difference) === '' ? true : bool(r.count_difference),
      note: text(r.note),
      row: r.__row,
    }))
  const updates = sheetUpdates(availableTabs, headers, cards.map((c) => c.sheetTab).filter((t) => t && availableTabs.includes(t)))

  return {
    title,
    headers,
    payables,
    payableAmounts,
    plannedExpenses,
    balanceChecks,
    updates,
    settings,
    cards,
    snapshots,
    lines,
    payments: rowsToObjects(values.Payments)
      // A voided entry (entered twice, did not happen, or by mistake) stays in the sheet; the app ignores it.
      .filter((r) => text(r.card_id) && isoDate(r.date) && !text(r.voided_at))
      .map((r) => ({
        payId: text(r.pay_id),
        date: isoDate(r.date),
        cardId: text(r.card_id),
        amount: money(r.amount),
        fromAccount: text(r.from_account),
        createdAt: text(r.created_at),
        row: r.__row,
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
          maintainingBalance: money(r.maintaining_balance),
          createdAt: text(r.created_at),
          row: r.__row,
        }
      }),
    transactions: rowsToObjects(values.Transactions)
      // A voided expense (did not happen, or entered by mistake) stays in the sheet; the app ignores it.
      .filter((r) => isoDate(r.date) && !text(r.voided_at))
      .map((r) => ({
        txnId: text(r.txn_id),
        date: isoDate(r.date),
        amount: money(r.amount),
        merchant: text(r.merchant),
        category: text(r.category),
        methodId: text(r.method_id),
        note: text(r.note),
        payableId: text(r.payable_id),
        payableMonth: yearMonth(r.payable_month),
        createdAt: text(r.created_at),
        row: r.__row,
      })),
    transfers: rowsToObjects(values.Transfers)
      .filter((r) => isoDate(r.date) && text(r.from_account) && text(r.to_account) && !text(r.voided_at))
      .map((r) => ({
        transferId: text(r.transfer_id),
        date: isoDate(r.date),
        fromAccount: text(r.from_account),
        toAccount: text(r.to_account),
        amount: money(r.amount),
        note: text(r.note),
        createdAt: text(r.created_at),
        row: r.__row,
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
      .filter((r) => isoDate(r.date) && !text(r.voided_at))
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
          createdAt: text(r.created_at),
          row: r.__row,
        }
      }),
  }
}

/** Reads every tab the app needs in three requests: metadata, fixed tabs, then the card statement tabs. */
export async function loadWorkbook(sheetId: string, token: string): Promise<Workbook> {
  const meta = await getSheetMeta(sheetId, token)
  const fixed = [...FIXED_TABS, ...(Object.keys(OPTIONAL_TABS) as string[])].filter((t) => meta.tabs.includes(t))
  const first = await getTabValues(sheetId, fixed, token)
  const cardTabs = rowsToObjects(first.Cards ?? [])
    .map((r) => text(r.sheet_tab))
    .filter((t) => t && meta.tabs.includes(t))
  const statements = cardTabs.length ? await getTabValues(sheetId, cardTabs, token) : {}
  return parseWorkbook(meta.title, meta.tabs, { ...first, ...statements })
}
