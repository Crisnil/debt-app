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

/** Money put into a savings account (e.g. Maribank). Saved as a transfer, so it counts toward the savings goal. Not spending. */
export function SavingsForm({ sheetId, workbook }: { sheetId: string; workbook: Workbook }) {
  const accounts = moneyAccounts(workbook).filter((a) => a.active && a.type !== 'e-wallet')
  const savings = accounts.filter((a) => a.isSavings)
  const sources = accounts.filter((a) => !a.isSavings)
  const salaryAccount = workbook.incomeSources.find((s) => s.sourceId === 'salary')?.toAccount
  const [from, setFrom] = useState(sources.some((a) => a.accountId === salaryAccount) ? salaryAccount! : (sources[0]?.accountId ?? ''))
  const [to, setTo] = useState(savings[0]?.accountId ?? '')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  if (savings.length === 0) {
    return <p className="text-sm text-slate-600">No savings goal account yet. In Settings → Accounts, edit one and tick “Savings goal money”.</p>
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(null)
    const cents = parsePositiveAmount(amount)
    if (cents === null) return setError('Enter an amount more than 0.')
    if (!from) return setError('Choose where the money comes from.')
    setError(null)
    addTransfer(sheetId, { date, fromAccount: from, toAccount: to, amount: cents, note: note.trim() })
    setSaved(`Saved ${formatPeso(cents)} to ${savings.find((a) => a.accountId === to)?.label ?? to}.`)
    setAmount('')
    setNote('')
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm text-slate-600">Counts toward your savings goal. Not spending.</p>
      <Field label="Amount (₱)" htmlFor="sv-amount">
        <AmountInput id="sv-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Chips label="From" options={sources.map((a) => ({ value: a.accountId, label: a.label }))} value={from} onChange={setFrom} />
      {savings.length > 1 && <Chips label="To" options={savings.map((a) => ({ value: a.accountId, label: a.label }))} value={to} onChange={setTo} />}
      <Field label="Date" htmlFor="sv-date">
        <TextInput id="sv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Note (optional)" htmlFor="sv-note">
        <TextInput id="sv-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full">
        Save to {savings.length === 1 ? savings[0].label : 'savings'}
      </Button>
      <ErrorNote message={error} />
      <SuccessNote message={saved} />
    </form>
  )
}
