import { Link } from 'react-router-dom'
import { accountBalances, savedInMonth, savingsGoal } from '../../domain/balances'
import { summarizeDues, todayIso, type CardSummary, type DueStatus } from '../../domain/dues'
import { estimateNextBill, type NextBillEstimate } from '../../domain/estimate'
import { reconcileCard } from '../../domain/reconcile'
import type { Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { useLiveWorkbook, useSession } from '../../state/hooks'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'
import { useAction } from '../../ui/useAction'

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{value}</dd>
    </>
  )
}

function CardRow({ c, next, toCheck }: { c: CardSummary; next: NextBillEstimate | null; toCheck: number }) {
  return (
    <li className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-slate-900">{c.card.name}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[c.status]}`}>{statusLabel[c.status]}</span>
      </div>
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
            <Row label="Logged spending" value={formatPeso(next.spending)} />
            {next.carried > 0 && <Row label="Carried + interest (est.)" value={formatPeso(next.carried + next.interest)} />}
          </dl>
        </div>
      )}
      <Link to={`/reconcile/${c.card.cardId}`} className="mt-3 inline-block text-sm text-green-900 underline">
        Check statement{toCheck > 0 ? ` · ${toCheck} to check` : ''}
      </Link>
    </li>
  )
}

function SavingsCard({ workbook, month }: { workbook: Workbook; month: string }) {
  const saved = savedInMonth(workbook, month)
  const goal = savingsGoal(workbook, month)
  const pct = goal > 0 ? Math.min(100, Math.max(0, Math.round((saved / goal) * 100))) : 0
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium text-slate-900">Savings this month</h2>
        <Link to="/add?type=move" className="text-sm text-green-900 underline">
          Move money
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {formatPeso(saved)} of {formatPeso(goal)} goal
      </p>
      <div className="mt-2 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-2 rounded-full bg-green-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function BalancesCard({ workbook }: { workbook: Workbook }) {
  const balances = accountBalances(workbook)
  if (balances.length === 0) return null
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <h2 className="font-medium text-slate-900">Accounts</h2>
      <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
        {balances.map(({ account, balance }) => (
          <Row key={account.accountId} label={account.label} value={formatPeso(balance)} />
        ))}
      </dl>
    </div>
  )
}

export function DashboardPage() {
  const { sheet, signedIn, signIn } = useSession()
  const { workbook, query } = useLiveWorkbook()
  const signInAction = useAction(signIn)

  if (!sheet) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-2 text-slate-600">Connect your Google Sheet to start.</p>
        <Link to="/settings" className="mt-4 inline-block rounded-lg bg-green-900 px-4 py-2.5 text-sm font-medium text-white">
          Go to Settings
        </Link>
      </section>
    )
  }

  if (!signedIn) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-2 text-slate-600">Sign in to load {sheet.name}.</p>
        <Button className="mt-4" onClick={() => signInAction.run()} disabled={signInAction.busy}>
          Sign in with Google
        </Button>
        <ErrorNote message={signInAction.error} />
      </section>
    )
  }

  if (query.error) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <ErrorNote message={query.error.message} />
        <Link to="/settings" className="mt-3 inline-block text-sm text-green-900 underline">
          Check Settings
        </Link>
      </section>
    )
  }
  if (!workbook) return <p className="text-slate-600">Reading your sheet…</p>

  const today = todayIso()
  const dues = summarizeDues(workbook, today)
  const estimates = dues.cards.map((c) => estimateNextBill(workbook, c.card, today))
  const nextTotal = estimates.reduce((s, e) => s + (e?.total ?? 0), 0)
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <Link to="/add" className="rounded-lg bg-green-900 px-4 py-2 text-sm font-medium text-white">
          + Add
        </Link>
      </div>
      <div className="rounded-xl bg-green-900 p-4 text-white">
        <p className="text-sm text-green-100">Left to pay on current statements</p>
        <p className="mt-1 text-3xl font-semibold">{formatPeso(dues.totalRemainingDue)}</p>
        <p className="mt-2 text-sm text-green-100">Next bills (est.): {formatPeso(nextTotal)}</p>
        <p className="text-sm text-green-100">Installments left: {formatPeso(dues.totalInstallmentsRemaining)}</p>
      </div>
      <SavingsCard workbook={workbook} month={today.slice(0, 7)} />
      <ul className="space-y-3">
        {dues.cards.map((c, i) => {
          const r = reconcileCard(workbook, c.card.cardId)
          return <CardRow key={c.card.cardId} c={c} next={estimates[i]} toCheck={r.probable.length + r.unlogged.length + r.notOnStatement.length} />
        })}
      </ul>
      <BalancesCard workbook={workbook} />
    </section>
  )
}
