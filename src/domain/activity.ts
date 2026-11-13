import type { Centavos } from '../lib/money'
import { accountLabel } from './accounts'
import { spendingItems, type SpendingItem } from './reconcile'
import { categoryOf } from './spending'
import type { IncomeType, IsoDate, Workbook } from './types'

/** purchase: spending. in: income and money received. move: between your accounts. payment: a credit card payment. */
export type EntryKind = 'purchase' | 'in' | 'move' | 'payment'

export const KIND_LABEL: Record<EntryKind, string> = { purchase: 'Purchase', in: 'Money in', move: 'Move', payment: 'Card payment' }

/** One row of the Transactions list. A purchase keeps its spending item, to correct or void it. */
export type Entry = {
  key: string
  kind: EntryKind
  date: IsoDate
  amount: Centavos
  label: string
  /** Account the money left (purchase: paid from; in: the income source id). */
  from: string
  /** Account the money went to (move, money in), or the card paid. '' for a purchase. */
  to: string
  note: string
  /** The sheet tab to change or remove the entry, when the app cannot. */
  tab: string
  item?: SpendingItem
  /** The row of a move, money in, or card payment, to void it. */
  ref?: EntryRef
}

export type EntryRef = { tab: 'Transfers' | 'IncomeLog' | 'Payments'; id: string; row?: number }

const INCOME_TYPE: Partial<Record<IncomeType, string>> = { gift: 'Gift', repayment: 'Paid back', bonus: 'Bonus', '13th_month': '13th month', allowance: 'Allowance' }

/**
 * Every entry once: purchases (from spendingItems), income and money received, moves, and card payments. Newest first.
 * Old e-wallet cash-outs stay purchases (less "E-wallet load"). Skipped paydays (₱0) are left out.
 */
export function entries(wb: Workbook): Entry[] {
  const list: Entry[] = spendingItems(wb).map((item, n) => ({
    key: `p-${n}`,
    kind: 'purchase',
    date: item.date,
    amount: item.amount,
    label: item.label,
    from: item.methodId,
    to: '',
    note: '',
    tab: '',
    item,
  }))
  for (const i of wb.incomeLog) {
    if (i.type === 'ewallet_return' || i.amount === 0) continue
    const source = wb.incomeSources.find((s) => s.sourceId === i.sourceId)?.label ?? INCOME_TYPE[i.type] ?? (i.sourceId || 'Income')
    list.push({
      key: `i-${i.incomeId}`,
      kind: 'in',
      date: i.date,
      amount: i.amount,
      label: source,
      from: i.sourceId,
      to: i.toAccount,
      note: i.note,
      tab: 'IncomeLog',
      ref: { tab: 'IncomeLog', id: i.incomeId, row: i.row },
    })
  }
  for (const t of wb.transfers) {
    list.push({
      key: `t-${t.transferId}`,
      kind: 'move',
      date: t.date,
      amount: t.amount,
      label: `${accountLabel(wb, t.fromAccount)} → ${accountLabel(wb, t.toAccount)}`,
      from: t.fromAccount,
      to: t.toAccount,
      note: t.note,
      tab: 'Transfers',
      ref: { tab: 'Transfers', id: t.transferId, row: t.row },
    })
  }
  for (const p of wb.payments) {
    list.push({
      key: `c-${p.payId}`,
      kind: 'payment',
      date: p.date,
      amount: p.amount,
      label: `${accountLabel(wb, p.cardId)} payment`,
      from: p.fromAccount,
      to: p.cardId,
      note: '',
      tab: 'Payments',
      ref: { tab: 'Payments', id: p.payId, row: p.row },
    })
  }
  // Stable sort: purchases keep their order within a day.
  return list.sort((a, b) => b.date.localeCompare(a.date))
}

/** month '' is every month. search: words in the description, note, or category, any case. */
export type EntryFilter = { month: string; kind: EntryKind | ''; accountId: string; category: string; search?: string }

/** Words of an entry to search: its description, note, and (purchases) category and the expense note. */
function searchText(e: Entry): string {
  return [e.label, e.note, e.item ? categoryOf(e.item) : '', e.item?.txn?.note ?? ''].join(' ').toLowerCase()
}

/** Entries in the month, then of one kind, for one account (either side), one category (purchases only), and with every searched word, when set. */
export function filterEntries(list: Entry[], filter: EntryFilter): Entry[] {
  const words = (filter.search ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  return list.filter(
    (e) =>
      e.date.startsWith(filter.month) &&
      (words.length === 0 || words.every((w) => searchText(e).includes(w))) &&
      (!filter.kind || e.kind === filter.kind) &&
      (!filter.accountId || e.from === filter.accountId || e.to === filter.accountId) &&
      (!filter.category || (e.item !== undefined && categoryOf(e.item) === filter.category)),
  )
}

/** Months (YYYY-MM) with entries, newest first. Always includes the current month. */
export function entryMonths(list: Entry[], currentMonth: string): string[] {
  return [...new Set([currentMonth, ...list.map((e) => e.date.slice(0, 7))])].sort().reverse()
}

/** Account choices for the entries: accounts and cards on either side, by label. Income sources are not accounts. */
export function entryAccounts(wb: Workbook, list: Entry[]): { value: string; label: string }[] {
  const ids = new Set<string>()
  for (const e of list) {
    if (e.kind !== 'in') ids.add(e.from)
    if (e.to) ids.add(e.to)
  }
  return [...ids].map((id) => ({ value: id, label: accountLabel(wb, id) })).sort((a, b) => a.label.localeCompare(b.label))
}

/** Total of each kind. */
export function totalsByKind(list: Entry[]): Record<EntryKind, Centavos> {
  const totals: Record<EntryKind, Centavos> = { purchase: 0, in: 0, move: 0, payment: 0 }
  for (const e of list) totals[e.kind] += e.amount
  return totals
}
