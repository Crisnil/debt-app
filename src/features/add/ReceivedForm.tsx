import { useState, type FormEvent } from 'react'
import { addIncome } from '../../data/actions'
import { moneyAccounts } from '../../domain/accounts'
import { todayIso } from '../../domain/dues'
import type { Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'
import { AmountInput, Chips, Field, SuccessNote, TextInput } from '../../ui/form'
import { parsePositiveAmount } from './parseAmount'

/** Money from a person: a gift, or money paid back to you. Adds to the account balance. Not part of the plan's income. */
export function ReceivedForm({ sheetId, workbook }: { sheetId: string; workbook: Workbook }) {
  const accounts = moneyAccounts(workbook).filter((a) => a.active)
  const [amount, setAmount] = useState('')
  const [from, setFrom] = useState('')
  const [type, setType] = useState<'gift' | 'repayment'>('gift')
  const [to, setTo] = useState(accounts.find((a) => a.type === 'cash')?.accountId ?? accounts[0]?.accountId ?? '')
  const [date, setDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(null)
    const cents = parsePositiveAmount(amount)
    if (cents === null) return setError('Enter an amount more than 0.')
    if (!from.trim()) return setError('Enter who gave the money.')
    setError(null)
    addIncome(sheetId, { date, sourceId: '', type, amount: cents, toAccount: to, note: [`From ${from.trim()}`, note.trim()].filter(Boolean).join(' · ') })
    setSaved(`Saved ${formatPeso(cents)} from ${from.trim()}.`)
    setAmount('')
    setFrom('')
    setNote('')
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Amount (₱)" htmlFor="rc-amount">
        <AmountInput id="rc-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="From" htmlFor="rc-from">
        <TextInput id="rc-from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="e.g. Tita" />
      </Field>
      <Chips
        label="Type"
        options={[
          { value: 'gift', label: 'Gift' },
          { value: 'repayment', label: 'Paid back to me' },
        ]}
        value={type}
        onChange={setType}
      />
      <Chips label="Received in" options={accounts.map((a) => ({ value: a.accountId, label: a.label }))} value={to} onChange={setTo} />
      <Field label="Date" htmlFor="rc-date">
        <TextInput id="rc-date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Note (optional)" htmlFor="rc-note">
        <TextInput id="rc-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <p className="text-sm text-slate-600">Adds to the account balance. Not counted in your monthly income for the plan.</p>
      <Button type="submit" className="w-full">
        Save received money
      </Button>
      <ErrorNote message={error} />
      <SuccessNote message={saved} />
    </form>
  )
}
