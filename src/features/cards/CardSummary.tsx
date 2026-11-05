import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { CardSummary, DueStatus } from '../../domain/dues'
import type { BillForecast } from '../../domain/forecast'
import { formatPeso } from '../../lib/money'

const statusLabel: Record<DueStatus, string> = {
  paid: 'Paid',
  due: 'Due',
  overdue: 'Overdue',
  'no-statement': 'No statement',
}

const statusStyle: Record<DueStatus, string> = {
  paid: 'bg-green-100 text-green-900',
  due: 'bg-amber-100 text-amber-900',
  overdue: 'bg-red-100 text-red-900',
  'no-statement': 'bg-slate-100 text-slate-600',
}

function dueText(c: CardSummary) {
  if (c.daysToDue === null || !c.snapshot) return ''
  if (c.status === 'paid') return `Due ${c.snapshot.dueDate}`
  const date = c.snapshot.dueDate
  if (c.daysToDue === 0) return `Due today (${date})`
  if (c.daysToDue === 1) return `Due tomorrow (${date})`
  if (c.daysToDue === -1) return `1 day late (${date})`
  return c.daysToDue > 0 ? `Due in ${c.daysToDue} days (${date})` : `${-c.daysToDue} days late (${date})`
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{value}</dd>
    </>
  )
}

/** One card: due status, what is left on the statement, the next bill, and a link to the card page. children: shown under the name. */
export function CardRow({ c, next, toCheck, children }: { c: CardSummary; next: BillForecast | undefined; toCheck: number; children?: ReactNode }) {
  return (
    <li className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-slate-900">{c.card.name}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[c.status]}`}>{statusLabel[c.status]}</span>
      </div>
      {children}
      {c.snapshot && (
        <>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatPeso(c.remainingDue)}</p>
          <p className="text-sm text-slate-600">{dueText(c)}</p>
          <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
            <Row label="Statement due" value={formatPeso(c.snapshot.currentDue)} />
            <Row label="Paid since statement" value={formatPeso(c.paidSinceStatement)} />
            {c.plannedPayments > 0 && <Row label="Planned payment" value={formatPeso(c.plannedPayments)} />}
            <Row label="Minimum" value={formatPeso(c.snapshot.minimumDue)} />
            {c.installmentCount > 0 && <Row label="Installments left" value={`${formatPeso(c.installmentsRemaining)} · ${c.lastInstallmentMonths} mo`} />}
          </dl>
        </>
      )}
      {next && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-900">
            Next bill {next.bill.statementDate} (due {next.bill.dueDate}) ≈ {formatPeso(next.total)}
          </p>
          <dl className="mt-1 grid grid-cols-2 gap-y-0.5">
            <Row label="Installments" value={formatPeso(next.installments)} />
            <Row label={next.fromStatement ? 'Purchases' : 'Logged spending'} value={formatPeso(next.purchases)} />
            {next.fees !== 0 && <Row label="Interest and fees" value={formatPeso(next.fees)} />}
            {next.carried > 0 && <Row label="Carried + interest (est.)" value={formatPeso(next.carried)} />}
            {next.estimate > 0 && <Row label="Usual spending (est.)" value={formatPeso(next.estimate)} />}
          </dl>
        </div>
      )}
      <Link to={`/cards/${c.card.cardId}`} className="mt-3 inline-block text-sm text-green-900 underline">
        Open card: check, paste statement, pay{toCheck > 0 ? ` · ${toCheck} to check` : ''}
      </Link>
    </li>
  )
}
