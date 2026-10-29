import { Link } from 'react-router-dom'
import { summarizeDues, todayIso, type CardSummary, type DueStatus } from '../../domain/dues'
import { formatPeso } from '../../lib/money'
import { useSession, useWorkbook } from '../../state/hooks'
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

function CardRow({ c }: { c: CardSummary }) {
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
            <dt className="text-slate-500">Statement due</dt>
            <dd className="text-right text-slate-800">{formatPeso(c.snapshot.currentDue)}</dd>
            <dt className="text-slate-500">Paid since statement</dt>
            <dd className="text-right text-slate-800">{formatPeso(c.paidSinceStatement)}</dd>
            {c.plannedPayments > 0 && (
              <>
                <dt className="text-slate-500">Planned payment</dt>
                <dd className="text-right text-slate-800">{formatPeso(c.plannedPayments)}</dd>
              </>
            )}
            <dt className="text-slate-500">Minimum</dt>
            <dd className="text-right text-slate-800">{formatPeso(c.snapshot.minimumDue)}</dd>
            {c.installmentCount > 0 && (
              <>
                <dt className="text-slate-500">Installments next bill</dt>
                <dd className="text-right text-slate-800">
                  {formatPeso(c.installmentsMonthly)} ({c.installmentCount})
                </dd>
                <dt className="text-slate-500">Installments left</dt>
                <dd className="text-right text-slate-800">
                  {formatPeso(c.installmentsRemaining)} · {c.lastInstallmentMonths} mo
                </dd>
              </>
            )}
          </dl>
        </>
      )}
    </li>
  )
}

export function DashboardPage() {
  const { sheet, signedIn, signIn } = useSession()
  const workbook = useWorkbook()
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

  if (workbook.isPending) return <p className="text-slate-600">Reading your sheet…</p>
  if (workbook.error) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <ErrorNote message={workbook.error.message} />
        <Link to="/settings" className="mt-3 inline-block text-sm text-green-900 underline">
          Check Settings
        </Link>
      </section>
    )
  }

  const dues = summarizeDues(workbook.data, todayIso())
  return (
    <section>
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
      <div className="mt-4 rounded-xl bg-green-900 p-4 text-white">
        <p className="text-sm text-green-100">Left to pay on current statements</p>
        <p className="mt-1 text-3xl font-semibold">{formatPeso(dues.totalRemainingDue)}</p>
        <p className="mt-2 text-sm text-green-100">
          Installments: {formatPeso(dues.totalInstallmentsMonthly)} next bill · {formatPeso(dues.totalInstallmentsRemaining)} left
        </p>
      </div>
      <ul className="mt-4 space-y-3">
        {dues.cards.map((c) => (
          <CardRow key={c.card.cardId} c={c} />
        ))}
      </ul>
    </section>
  )
}
