import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { linkStatementLine } from '../../data/actions'
import { NO_MATCH, reconcileCard } from '../../domain/reconcile'
import type { StatementLine, Transaction, Workbook } from '../../domain/types'
import { currentToken } from '../../google/auth'
import { formatPeso } from '../../lib/money'
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

/** Matched, to-check, and not-billed purchases of one card. Links made here are saved right away (online only). */
export function CheckStatement({ sheetId, workbook, cardId }: { sheetId: string; workbook: Workbook; cardId: string }) {
  const queryClient = useQueryClient()
  // The line (sheet row) being saved, the line whose save failed, and a short note after a save.
  const [saving, setSaving] = useState<{ row: number; txnId: string } | null>(null)
  const [failed, setFailed] = useState<{ row: number; message: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const busy = saving !== null

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 3000)
    return () => clearTimeout(timer)
  }, [notice])

  const r = reconcileCard(workbook, cardId)
  const linkable = [...r.notOnStatement, ...r.unbilled]

  async function link(line: StatementLine, txnId: string) {
    setNotice(null)
    const token = currentToken()
    if (!token) return setFailed({ row: line.row, message: 'Your Google sign-in expired. Sign in again on the Home screen.' })
    setSaving({ row: line.row, txnId })
    setFailed(null)
    try {
      await linkStatementLine(sheetId, workbook, line, txnId, token)
      await queryClient.invalidateQueries({ queryKey: ['workbook', sheetId] })
      setNotice(txnId === '' ? 'Unlinked.' : txnId === NO_MATCH ? 'Saved: not logged. Counted from the statement.' : 'Linked. Counted once.')
    } catch (e) {
      setFailed({ row: line.row, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(null)
    }
  }

  /** Button text, "Saving…" while this line and choice are being saved. */
  const label = (line: StatementLine, txnId: string, text: string) => (saving?.row === line.row && saving.txnId === txnId ? 'Saving…' : text)
  /** Lines still in the outbox are not in the sheet yet, so they cannot be linked. */
  const LineNote = ({ line }: { line: StatementLine }) =>
    line.row === 0 ? (
      <p className="mt-2 text-xs text-amber-900">Waiting to be saved to the sheet. Link it after it syncs.</p>
    ) : failed?.row === line.row ? (
      <ErrorNote message={failed.message} />
    ) : null

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Each purchase is counted once. Your expense and the same line on the statement are matched by card, amount, and date (±3 days).
        {r.latestStatement && ` Latest statement: ${r.latestStatement}.`}
      </p>
      {notice && (
        <p role="status" className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 rounded-lg bg-green-900 p-3 text-center text-sm text-white shadow-lg lg:inset-x-auto lg:right-10 lg:bottom-10">
          {notice}
        </p>
      )}

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
              <Button disabled={busy || line.row === 0} onClick={() => link(line, txn.txnId)}>
                {label(line, txn.txnId, 'Same purchase')}
              </Button>
              <Button variant="secondary" disabled={busy || line.row === 0} onClick={() => link(line, NO_MATCH)}>
                {label(line, NO_MATCH, 'Not the same')}
              </Button>
            </div>
            <LineNote line={line} />
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
                  disabled={busy || line.row === 0}
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
              <Button variant="secondary" disabled={busy || line.row === 0} onClick={() => link(line, NO_MATCH)}>
                {saving?.row === line.row ? 'Saving…' : 'I did not log it'}
              </Button>
            </div>
            <LineNote line={line} />
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
                {label(line, '', 'Unlink')}
              </button>
            )}
            {failed?.row === line.row && <ErrorNote message={failed.message} />}
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
    </div>
  )
}
