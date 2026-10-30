import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { linkStatementLine } from '../../data/actions'
import { NO_MATCH, reconcileCard } from '../../domain/reconcile'
import type { StatementLine, Transaction } from '../../domain/types'
import { currentToken } from '../../google/auth'
import { formatPeso } from '../../lib/money'
import { useLiveWorkbook, useSession } from '../../state/hooks'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'

function LineText({ line }: { line: StatementLine }) {
  return (
    <span>
      {line.txnDate || line.postDate} · {line.description} · <b>{formatPeso(line.amount)}</b>
    </span>
  )
}

function TxnText({ txn }: { txn: Transaction }) {
  return (
    <span>
      {txn.date} · {txn.merchant} · <b>{formatPeso(txn.amount)}</b>
      {txn.category && <span className="text-slate-500"> · {txn.category}</span>}
    </span>
  )
}

function Section({ title, count, tone, children }: { title: string; count: number; tone: 'ok' | 'warn' | 'info'; children?: ReactNode }) {
  const color = { ok: 'text-green-900', warn: 'text-amber-900', info: 'text-slate-700' }[tone]
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <h2 className={`font-medium ${color}`}>
        {title} ({count})
      </h2>
      {count > 0 && <ul className="mt-2 space-y-2 text-sm text-slate-800">{children}</ul>}
    </div>
  )
}

export function ReconcilePage() {
  const { cardId = '' } = useParams()
  const { sheet } = useSession()
  const { workbook } = useLiveWorkbook()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!sheet || !workbook) return <p className="text-slate-600">Reading your sheet…</p>
  const card = workbook.cards.find((c) => c.cardId === cardId)
  if (!card) return <p className="text-slate-600">Card not found.</p>
  const r = reconcileCard(workbook, cardId)
  const linkable = [...r.notOnStatement, ...r.unbilled]

  async function link(line: StatementLine, txnId: string) {
    const token = currentToken()
    if (!token || !sheet || !workbook) return setError('Sign in again to save links.')
    setBusy(true)
    setError(null)
    try {
      await linkStatementLine(sheet.id, workbook, line, txnId, token)
      await queryClient.invalidateQueries({ queryKey: ['workbook', sheet.id] })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4">
      <Link to="/" className="text-sm text-green-900 underline">
        ← Home
      </Link>
      <h1 className="text-2xl font-semibold text-slate-900">Check {card.name} statement</h1>
      <p className="text-sm text-slate-600">
        Each purchase is counted once. Your expense and the same line on the statement are matched by card, amount, and date (±3 days).
        {r.latestStatement && ` Latest statement: ${r.latestStatement}.`}
      </p>
      <ErrorNote message={error} />

      <Section title="Please confirm" count={r.probable.length} tone="warn">
        {r.probable.map(({ line, txn }) => (
          <li key={`${line.row}-${txn.txnId}`} className="rounded-lg bg-amber-50 p-3">
            <p>
              Statement: <LineText line={line} />
            </p>
            <p>
              Your entry: <TxnText txn={txn} />
            </p>
            <div className="mt-2 flex gap-2">
              <Button disabled={busy} onClick={() => link(line, txn.txnId)}>
                Same purchase
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => link(line, NO_MATCH)}>
                Not the same
              </Button>
            </div>
          </li>
        ))}
      </Section>

      <Section title="On the statement, not logged" count={r.unlogged.length} tone="warn">
        {r.unlogged.map((line) => (
          <li key={line.row} className="rounded-lg bg-amber-50 p-3">
            <LineText line={line} />
            <div className="mt-2 flex flex-wrap gap-2">
              {linkable.length > 0 && (
                <select
                  aria-label="Link to an expense"
                  className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
                  disabled={busy}
                  defaultValue=""
                  onChange={(e) => e.target.value && link(line, e.target.value)}
                >
                  <option value="">Link to my entry…</option>
                  {linkable.map((t) => (
                    <option key={t.txnId} value={t.txnId}>
                      {t.date} · {t.merchant} · {formatPeso(t.amount)}
                    </option>
                  ))}
                </select>
              )}
              <Button variant="secondary" disabled={busy} onClick={() => link(line, NO_MATCH)}>
                I did not log it
              </Button>
            </div>
          </li>
        ))}
      </Section>

      <Section title="Logged, not on the statement" count={r.notOnStatement.length} tone="warn">
        {r.notOnStatement.map((t) => (
          <li key={t.txnId} className="rounded-lg bg-amber-50 p-3">
            <TxnText txn={t} />
            <p className="mt-1 text-xs text-amber-900">May post on the next bill, or the card in the entry is wrong. Fix the entry in the sheet if needed.</p>
          </li>
        ))}
      </Section>

      <Section title="Matched" count={r.matched.length} tone="ok">
        {r.matched.map(({ line, txn, how }) => (
          <li key={`${line.row}-${txn.txnId}`} className="flex items-start justify-between gap-2">
            <TxnText txn={txn} />
            {how === 'manual' && (
              <button className="shrink-0 text-xs text-slate-500 underline" disabled={busy} onClick={() => link(line, '')}>
                Unlink
              </button>
            )}
          </li>
        ))}
      </Section>

      <Section title="Not billed yet" count={r.unbilled.length} tone="info">
        {r.unbilled.map((t) => (
          <li key={t.txnId}>
            <TxnText txn={t} />
          </li>
        ))}
      </Section>

      <Section title="From the statement only" count={r.beforeTracking.length + r.acknowledged.length} tone="info">
        {[...r.acknowledged, ...r.beforeTracking].map((line) => (
          <li key={line.row}>
            <LineText line={line} />
          </li>
        ))}
      </Section>
    </section>
  )
}
