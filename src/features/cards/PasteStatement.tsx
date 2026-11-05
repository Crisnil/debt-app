import { useState } from 'react'
import { addStatementLine } from '../../data/actions'
import { NO_MATCH } from '../../domain/reconcile'
import { nextStatementDate, readStatementBlock, type PastedRow } from '../../domain/statementPaste'
import type { LineType, Transaction, Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'
import { Field, SuccessNote, TextInput } from '../../ui/form'

const typeLabel: Record<LineType, string> = {
  straight: 'Purchase',
  installment: 'Installment',
  payment: 'Payment',
  credit: 'Credit/refund',
  interest: 'Interest',
  fee: 'Fee',
}

/** include: save this line. link: the confirmed expense, NO_MATCH ("not this"), or '' (no link). */
type Choice = { include: boolean; link: string }

const txnText = (t: Transaction) => `${t.date} · ${t.merchant || t.category || 'expense'} · ${formatPeso(t.amount)}`

function MatchPicker({ row, link, onChange }: { row: PastedRow; link: string; onChange: (link: string) => void }) {
  if (!row.line || row.line.type !== 'straight') return null
  if (row.candidates.length === 0) return <p className="mt-1 text-xs text-slate-500">No logged expense with this amount. Counted from the statement.</p>
  if (row.candidates.length === 1) {
    const t = row.candidates[0]
    return (
      <div className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
        <p>Matches your entry: {txnText(t)}?</p>
        <div className="mt-2 flex gap-2">
          <Button className="py-1.5" variant={link === t.txnId ? 'primary' : 'secondary'} aria-pressed={link === t.txnId} onClick={() => onChange(t.txnId)}>
            Same purchase
          </Button>
          <Button className="py-1.5" variant={link === NO_MATCH ? 'primary' : 'secondary'} aria-pressed={link === NO_MATCH} onClick={() => onChange(NO_MATCH)}>
            Not this
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
      <label className="block">
        {row.candidates.length} entries have this amount. Which one is it?
        <select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900" value={link} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {row.candidates.map((t) => (
            <option key={t.txnId} value={t.txnId}>
              {txnText(t)}
            </option>
          ))}
          <option value={NO_MATCH}>None of these</option>
        </select>
      </label>
    </div>
  )
}

/** Paste lines copied from the billing statement. Shows each line with its matching expense, then saves all at once. */
export function PasteStatement({ sheetId, workbook, cardId }: { sheetId: string; workbook: Workbook; cardId: string }) {
  const card = workbook.cards.find((c) => c.cardId === cardId)!
  const [statementDate, setStatementDate] = useState(() => nextStatementDate(workbook, card))
  const [raw, setRaw] = useState('')
  const [rows, setRows] = useState<PastedRow[] | null>(null)
  const [choices, setChoices] = useState<Choice[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const canLink = (workbook.headers[card.sheetTab] ?? []).includes('txn_id')
  const readable = rows?.map((row, i) => ({ row, i })).filter(({ row }) => row.line) ?? []
  const unreadable = rows?.filter((row) => !row.line) ?? []
  const toSave = readable.filter(({ i }) => choices[i]?.include)

  function read() {
    setSaved(null)
    if (!statementDate) return setError('Enter the statement date first.')
    const next = readStatementBlock(workbook, cardId, raw, statementDate)
    if (!next.some((r) => r.line)) {
      setRows(null)
      return setError('No line could be read. Copy the lines with the dates and amounts, or add a line by hand.')
    }
    setError(null)
    setRows(next)
    setChoices(next.map((r) => ({ include: Boolean(r.line) && !r.duplicate, link: r.suggested })))
  }

  function choose(i: number, change: Partial<Choice>) {
    setChoices((all) => all.map((c, j) => (j === i ? { ...c, ...change } : c)))
  }

  function saveAll() {
    const links = toSave.map(({ i }) => choices[i].link).filter((l) => l && l !== NO_MATCH)
    if (new Set(links).size !== links.length) return setError('One expense is linked to two lines. Change one of them.')
    setError(null)
    for (const { row, i } of toSave) {
      const line = row.line!
      addStatementLine(sheetId, workbook, cardId, {
        statementDate,
        postDate: line.postDate,
        txnDate: line.txnDate || line.postDate,
        description: line.description,
        type: line.type,
        amount: line.amount,
        termNo: line.termNo,
        totalTerms: line.totalTerms,
        category: '',
        linkedTxnId: choices[i].link || undefined,
      })
    }
    setSaved(`Saved ${toSave.length} line${toSave.length === 1 ? '' : 's'}, ${links.length} matched to your entries.`)
    setRaw('')
    setRows(null)
    setChoices([])
  }

  return (
    <div className="space-y-4">
      <Field label="Statement date (cut-off)" htmlFor="ps-stmt">
        <TextInput id="ps-stmt" type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} />
      </Field>
      <Field label="Paste the lines from your billing statement" htmlFor="ps-raw" hint="One transaction per line, with the dates and amount. Other lines are skipped.">
        <textarea
          id="ps-raw"
          rows={6}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-900"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
      </Field>
      <Button variant="secondary" className="w-full" disabled={!raw.trim()} onClick={read}>
        Read lines
      </Button>

      {rows && (
        <div className="space-y-3">
          {!canLink && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Tab “{card.sheetTab}” has no <code>txn_id</code> column, so matches will not be saved. Add the column to the tab.
            </p>
          )}
          <ul className="space-y-2">
            {readable.map(({ row, i }) => {
              const line = row.line!
              return (
                <li key={i} className={`rounded-lg bg-white p-3 text-sm shadow-sm ${choices[i].include ? '' : 'opacity-60'}`}>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" checked={choices[i].include} onChange={(e) => choose(i, { include: e.target.checked })} />
                    <span className="text-slate-800">
                      {line.txnDate || line.postDate} · {line.description} · <b>{formatPeso(line.amount)}</b>
                      {line.type !== 'straight' && <span className="text-slate-500"> · {typeLabel[line.type]}</span>}
                      {line.termNo && line.totalTerms && <span className="text-slate-500"> {line.termNo}/{line.totalTerms}</span>}
                      {row.duplicate && <span className="text-amber-900"> · Already in the sheet</span>}
                    </span>
                  </label>
                  {choices[i].include && <MatchPicker row={row} link={choices[i].link} onChange={(link) => choose(i, { link })} />}
                </li>
              )
            })}
          </ul>
          {unreadable.length > 0 && (
            <details className="text-sm text-slate-600">
              <summary className="cursor-pointer">
                {unreadable.length} line{unreadable.length === 1 ? '' : 's'} skipped (not a transaction line)
              </summary>
              <ul className="mt-1 space-y-1 font-mono text-xs">
                {unreadable.map((row, i) => (
                  <li key={i}>{row.raw}</li>
                ))}
              </ul>
            </details>
          )}
          <Button className="w-full" disabled={toSave.length === 0} onClick={saveAll}>
            Save {toSave.length} line{toSave.length === 1 ? '' : 's'}
          </Button>
        </div>
      )}
      <ErrorNote message={error} />
      <SuccessNote message={saved} />
    </div>
  )
}
