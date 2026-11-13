import { useState, type FormEvent } from 'react'
import { addTransfer } from '../../data/actions'
import { moneyAccounts } from '../../domain/accounts'
import { todayIso } from '../../domain/dues'
import type { Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'
import { AmountInput, Chips, Field, TextInput } from '../../ui/form'
import { parsePositiveAmount } from './parseAmount'
import { SavedNote, type Saved } from './SavedNote'

const LAST_FROM_KEY = 'debt-app.last-move-from'

/**
 * Money moved between two of your accounts, e.g. an ATM withdrawal (savings → Cash) or a GCash load. Saved as a
 * transfer: not spending. Out of a savings account lowers saved this month; into one counts toward the savings goal.
 */
export function MoveMoneyForm({ sheetId, workbook, initialTo }: { sheetId: string; workbook: Workbook; initialTo?: string }) {
  const accounts = moneyAccounts(workbook).filter((a) => a.active)
  const has = (id: string | null | undefined) => accounts.some((a) => a.accountId === id)
  const cash = accounts.find((a) => a.type === 'cash')?.accountId
  const salaryAccount = workbook.incomeSources.find((s) => s.sourceId === 'salary')?.toAccount
  // ?to=savings: the savings goal account (the old "Add savings").
  const toSavings = initialTo === 'savings' ? accounts.find((a) => a.isSavings)?.accountId : initialTo
  const presetTo = has(toSavings) ? toSavings : undefined
  const lastFrom = localStorage.getItem(LAST_FROM_KEY)
  const firstFrom = presetTo
    ? ([lastFrom, salaryAccount].find((id) => has(id) && id !== presetTo) ?? accounts.find((a) => a.accountId !== presetTo)?.accountId ?? '')
    : ([lastFrom, accounts.find((a) => a.isSavings)?.accountId, salaryAccount].find((id) => has(id) && id !== cash) ?? accounts[0]?.accountId ?? '')
  const [from, setFrom] = useState(firstFrom)
  const [to, setTo] = useState(presetTo ?? (cash && cash !== firstFrom ? cash : (accounts.find((a) => a.accountId !== firstFrom)?.accountId ?? '')))
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<Saved | null>(null)

  if (accounts.length < 2) {
    return <p className="text-sm text-slate-600">Add a second account first (Settings → Accounts → + Add account).</p>
  }

  const label = (id: string) => accounts.find((a) => a.accountId === id)?.label ?? id
  const isSavings = (id: string) => accounts.some((a) => a.accountId === id && a.isSavings)
  const isWallet = (id: string) => accounts.some((a) => a.accountId === id && a.type === 'e-wallet')
  const cents = parsePositiveAmount(amount)
  const effect =
    isSavings(from) && !isSavings(to)
      ? `Lowers saved this month${cents ? ` by ${formatPeso(cents)}` : ''}. Not spending.`
      : isSavings(to) && !isSavings(from)
        ? 'Counts toward your savings goal. Not spending.'
        : isWallet(to)
          ? `Not spending. Log what you buy with ${label(to)} as expenses paid from ${label(to)}.`
          : 'Not spending. Log what you buy with it as expenses.'

  function chooseFrom(id: string) {
    setFrom(id)
    if (id === to) setTo(accounts.find((a) => a.accountId !== id)?.accountId ?? '')
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(null)
    if (cents === null) return setError('Enter an amount more than 0.')
    if (!from || !to || from === to) return setError('Choose two different accounts.')
    setError(null)
    const move = addTransfer(sheetId, { date, fromAccount: from, toAccount: to, amount: cents, note: note.trim() })
    localStorage.setItem(LAST_FROM_KEY, from)
    setSaved({ message: `Moved ${formatPeso(cents)} from ${label(from)} to ${label(to)}.`, ref: { tab: 'Transfers', id: move.transferId } })
    setAmount('')
    setNote('')
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm text-slate-600">For an ATM withdrawal, an e-wallet load, money put into savings, or any move between your accounts.</p>
      <Field label="Amount (₱)" htmlFor="mv-amount">
        <AmountInput id="mv-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Chips label="From" options={accounts.map((a) => ({ value: a.accountId, label: a.label }))} value={from} onChange={chooseFrom} />
      <Chips label="To" options={accounts.filter((a) => a.accountId !== from).map((a) => ({ value: a.accountId, label: a.label }))} value={to} onChange={setTo} />
      <p className="text-sm text-slate-600">{effect}</p>
      <Field label="Date" htmlFor="mv-date">
        <TextInput id="mv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Note (optional)" htmlFor="mv-note">
        <TextInput id="mv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. ATM" />
      </Field>
      <Button type="submit" className="w-full">
        Move money
      </Button>
      <ErrorNote message={error} />
      {saved && <SavedNote key={saved.ref.id} saved={saved} amountId="mv-amount" onClear={() => setSaved(null)} />}
    </form>
  )
}
