import type { CardSnapshot, LineType, StatementLine, Workbook } from '../domain/types'
import { getSheetMeta, getTabValues, type TabValues } from '../google/sheetsApi'
import { bool, int, isoDate, money, num, rowsToObjects, text } from './cells'
import { checkHeaders, checkTabs, STATEMENT_TAB_HEADERS, TABS, type SchemaProblem } from './schema'

const LINE_TYPES = new Set<LineType>(['installment', 'straight', 'payment', 'interest', 'fee', 'credit'])

export class SchemaError extends Error {
  readonly problems: SchemaProblem[]
  constructor(problems: SchemaProblem[]) {
    super(problems.map((p) => p.message).join(' '))
    this.problems = problems
  }
}

/** Converts raw tab values to a typed workbook. Throws SchemaError if tabs or headers are missing. */
export function parseWorkbook(title: string, availableTabs: readonly string[], values: TabValues): Workbook {
  const fixedTabs = Object.keys(TABS) as (keyof typeof TABS)[]
  const problems: SchemaProblem[] = [...checkTabs(availableTabs, fixedTabs)]
  for (const tab of fixedTabs) {
    if (availableTabs.includes(tab)) problems.push(...checkHeaders(tab, values[tab]?.[0], TABS[tab]))
  }
  if (problems.length) throw new SchemaError(problems)

  const settings = Object.fromEntries(rowsToObjects(values.Settings).map((r) => [text(r.key), text(r.value)]))

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
        statementDate: isoDate(r.statement_date),
        postDate: isoDate(r.post_date),
        txnDate: isoDate(r.txn_date),
        description: text(r.description),
        type,
        amount: money(r.amount),
        termNo: int(r.term_no),
        totalTerms: int(r.total_terms),
        category: text(r.category),
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
    settings,
    cards,
    snapshots,
    lines,
    payments: rowsToObjects(values.Payments)
      .filter((r) => text(r.card_id) && isoDate(r.date))
      .map((r) => ({ date: isoDate(r.date), cardId: text(r.card_id), amount: money(r.amount) })),
    categories: rowsToObjects(values.Categories)
      .filter((r) => text(r.category))
      .map((r) => ({ category: text(r.category), weeklyBudget: money(r.weekly_budget), defaultMethod: text(r.default_method) })),
    paymentMethods: rowsToObjects(values.PaymentMethods)
      .filter((r) => text(r.method_id))
      .map((r) => ({ methodId: text(r.method_id), label: text(r.label), type: text(r.type), active: bool(r.active) })),
    transactions: rowsToObjects(values.Transactions)
      .filter((r) => isoDate(r.date))
      .map((r) => ({
        txnId: text(r.txn_id),
        date: isoDate(r.date),
        amount: money(r.amount),
        merchant: text(r.merchant),
        category: text(r.category),
        methodId: text(r.method_id),
      })),
  }
}

/** Reads every tab the app needs in three requests: metadata, fixed tabs, then the card statement tabs. */
export async function loadWorkbook(sheetId: string, token: string): Promise<Workbook> {
  const meta = await getSheetMeta(sheetId, token)
  const fixed = Object.keys(TABS).filter((t) => meta.tabs.includes(t))
  const first = await getTabValues(sheetId, fixed, token)
  const cardTabs = rowsToObjects(first.Cards ?? [])
    .map((r) => text(r.sheet_tab))
    .filter((t) => t && meta.tabs.includes(t))
  const statements = cardTabs.length ? await getTabValues(sheetId, cardTabs, token) : {}
  return parseWorkbook(meta.title, meta.tabs, { ...first, ...statements })
}
