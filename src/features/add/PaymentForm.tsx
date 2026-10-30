import { useState, type FormEvent } from 'react'
import { addPayment } from '../../data/actions'
import { moneyAccounts } from '../../domain/accounts'
import { summarizeCard, todayIso } from '../../domain/dues'
import type { Workbook } from '../../domain/types'
import { formatPeso, toPesos } from '../../lib/money'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'
import { AmountInput, Chips, Field, SuccessNote, TextInput } from '../../ui/form'
import { parsePositiveAmount } from './parseAmount'

export function PaymentForm({ sheetId, workbook }: { sheetId: string; workbook: Workbook }) {
  const cards = workbook.cards.filter((c) => c.active)
  const accounts = moneyAccounts(workbook).filter((a) => a.active)
  const salaryAccount = workbook.incomeSources.find((s) => s.sourceId === 'salary')?.toAccount
  const [cardId, setCardId] = useState(cards[0]?.cardId ?? '')
  const [from, setFrom] = useState(salaryAccount || accounts[0]?.accountId || '')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const card = cards.find((c) => c.cardId === cardId)
  const summary = card ? summarizeCard(workbook, card, todayIso()) : null

  function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(null)
    const cents = parsePositiveAmount(amount)
    if (cents === null) return setError('Enter an amount more than 0.')
    setError(null)
    addPayment(sheetId, { date, cardId, amount: cents, fromAccount: from, note: note.trim() })
    setSaved(`Paid ${formatPeso(cents)} to ${card?.name ?? cardId}.`)
    setAmount('')
    setNote('')
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Chips label="Card" options={cards.map((c) => ({ value: c.cardId, label: c.name }))} value={cardId} onChange={setCardId} />
      {summary?.snapshot && (
        <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
          Left on the {summary.snapshot.asOf} statement: <b>{formatPeso(summary.remainingDue)}</b> (due {summary.snapshot.dueDate}). Minimum{' '}
          {formatPeso(summary.snapshot.minimumDue)}.
          {summary.remainingDue > 0 && (
            <button type="button" className="ml-2 text-green-900 underline" onClick={() => setAmount(toPesos(summary.remainingDue).toFixed(2))}>
              Pay in full
            </button>
          )}
        </div>
      )}
      <Field label="Amount (₱)" htmlFor="pay-amount">
        <AmountInput id="pay-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Chips label="Paid from" options={accounts.map((a) => ({ value: a.accountId, label: a.label }))} value={from} onChange={setFrom} />
      <Field label="Date" htmlFor="pay-date" hint="A future date is shown as a planned payment until that day.">
        <TextInput id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Note (optional)" htmlFor="pay-note">
        <TextInput id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full">
        Save payment
      </Button>
      <ErrorNote message={error} />
      <SuccessNote message={saved} />
    </form>
  )
}
