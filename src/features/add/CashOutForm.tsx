import { useState, type FormEvent } from 'react'
import { addIncome } from '../../data/actions'
import { EWALLET_LOAD, moneyAccounts } from '../../domain/accounts'
import { todayIso } from '../../domain/dues'
import type { Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'
import { AmountInput, Chips, Field, SuccessNote, TextInput } from '../../ui/form'
import { parsePositiveAmount } from './parseAmount'

/** Money moved from GCash or Maya back to a bank. Adds to the bank balance and lowers "E-wallet load" spending. Not income. */
export function CashOutForm({ sheetId, workbook }: { sheetId: string; workbook: Workbook }) {
  const accounts = moneyAccounts(workbook).filter((a) => a.active)
  const wallets = accounts.filter((a) => a.type === 'e-wallet')
  const banks = accounts.filter((a) => a.type === 'bank')
  const salaryAccount = workbook.incomeSources.find((s) => s.sourceId === 'salary')?.toAccount
  const [from, setFrom] = useState(wallets[0]?.accountId ?? '')
  const [to, setTo] = useState(banks.some((a) => a.accountId === salaryAccount) ? salaryAccount! : (banks[0]?.accountId ?? ''))
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(null)
    const cents = parsePositiveAmount(amount)
    if (cents === null) return setError('Enter an amount more than 0.')
    if (!to) return setError('Choose the bank that gets the money.')
    setError(null)
    addIncome(sheetId, { date, sourceId: from, type: 'ewallet_return', amount: cents, toAccount: to, note: note.trim() })
    setSaved(`Saved ${formatPeso(cents)} back to ${banks.find((a) => a.accountId === to)?.label ?? to}.`)
    setAmount('')
    setNote('')
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm text-slate-600">Lowers your “{EWALLET_LOAD}” spending. Not counted as income.</p>
      <Field label="Amount (₱)" htmlFor="co-amount">
        <AmountInput id="co-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      {wallets.length > 1 && <Chips label="From" options={wallets.map((a) => ({ value: a.accountId, label: a.label }))} value={from} onChange={setFrom} />}
      <Chips label="To" options={banks.map((a) => ({ value: a.accountId, label: a.label }))} value={to} onChange={setTo} />
      <Field label="Date" htmlFor="co-date">
        <TextInput id="co-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Note (optional)" htmlFor="co-note">
        <TextInput id="co-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full">
        Save cash-out
      </Button>
      <ErrorNote message={error} />
      <SuccessNote message={saved} />
    </form>
  )
}
