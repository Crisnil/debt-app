import { useState, type FormEvent } from 'react'
import { addTransfer } from '../../data/actions'
import { moneyAccounts } from '../../domain/accounts'
import { todayIso } from '../../domain/dues'
import type { Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'
import { AmountInput, Chips, Field, SuccessNote, TextInput } from '../../ui/form'
import { parsePositiveAmount } from './parseAmount'

export function TransferForm({ sheetId, workbook }: { sheetId: string; workbook: Workbook }) {
  const accounts = moneyAccounts(workbook).filter((a) => a.active)
  const firstSavings = accounts.find((a) => a.isSavings)?.accountId
  const firstOther = accounts.find((a) => !a.isSavings)?.accountId
  const [from, setFrom] = useState(firstOther ?? accounts[0]?.accountId ?? '')
  const [to, setTo] = useState(firstSavings ?? accounts[1]?.accountId ?? '')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const options = accounts.map((a) => ({ value: a.accountId, label: a.label }))
  const toSavings = accounts.find((a) => a.accountId === to)?.isSavings ?? false
  const fromSavings = accounts.find((a) => a.accountId === from)?.isSavings ?? false

  function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(null)
    const cents = parsePositiveAmount(amount)
    if (cents === null) return setError('Enter an amount more than 0.')
    if (from === to) return setError('Choose two different accounts.')
    setError(null)
    addTransfer(sheetId, { date, fromAccount: from, toAccount: to, amount: cents, note: note.trim() })
    setSaved(`Moved ${formatPeso(cents)}.`)
    setAmount('')
    setNote('')
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm text-slate-600">Moving money is not spending. It changes account balances only.</p>
      <Field label="Amount (₱)" htmlFor="tr-amount">
        <AmountInput id="tr-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Chips label="From" options={options} value={from} onChange={setFrom} />
      <Chips label="To" options={options} value={to} onChange={setTo} />
      {toSavings && !fromSavings && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900">Counts toward your savings goal.</p>}
      {fromSavings && !toSavings && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This takes money out of savings.</p>}
      <Field label="Date" htmlFor="tr-date">
        <TextInput id="tr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Note (optional)" htmlFor="tr-note">
        <TextInput id="tr-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full">
        Save move
      </Button>
      <ErrorNote message={error} />
      <SuccessNote message={saved} />
    </form>
  )
}
