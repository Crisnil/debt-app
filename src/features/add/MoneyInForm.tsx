import { useState, type FormEvent } from 'react'
import { addIncome } from '../../data/actions'
import { moneyAccounts } from '../../domain/accounts'
import { todayIso } from '../../domain/dues'
import type { IncomeType, Workbook } from '../../domain/types'
import { formatPeso, toPesos } from '../../lib/money'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'
import { AmountInput, Chips, Field, SuccessNote, TextInput } from '../../ui/form'
import { parsePositiveAmount } from './parseAmount'

/** One-time income: counts in the plan's income. */
const EXTRA: { value: IncomeType; label: string }[] = [
  { value: 'bonus', label: 'Bonus' },
  { value: '13th_month', label: '13th month' },
  { value: 'side', label: 'Side income' },
]

/** Money from a person: adds to the account balance, not to the plan's income. */
const FROM_PERSON: { value: IncomeType; label: string }[] = [
  { value: 'gift', label: 'Gift' },
  { value: 'repayment', label: 'Paid back to me' },
]

const OTHER = 'other'

/**
 * All money coming in, in one form: salary and other income sources (from Settings), one-time income, and money
 * from a person (a gift, or money paid back). Saved to the IncomeLog tab.
 */
export function MoneyInForm({ sheetId, workbook }: { sheetId: string; workbook: Workbook }) {
  const sources = workbook.incomeSources.filter((s) => s.active)
  const accounts = moneyAccounts(workbook).filter((a) => a.active)
  const first = sources[0]
  const [kind, setKind] = useState<string>(first?.sourceId ?? 'gift')
  const [amount, setAmount] = useState(first ? toPesos(first.amount).toFixed(2) : '')
  const [who, setWho] = useState('')
  const [to, setTo] = useState(first?.toAccount || accounts[0]?.accountId || '')
  const [date, setDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const source = sources.find((s) => s.sourceId === kind)
  const fromPerson = FROM_PERSON.some((o) => o.value === kind)
  const extra = EXTRA.some((o) => o.value === kind) || kind === OTHER

  function pick(value: string) {
    setKind(value)
    const s = sources.find((x) => x.sourceId === value)
    if (s) {
      setAmount(toPesos(s.amount).toFixed(2))
      if (s.toAccount) setTo(s.toAccount)
    } else if (source) setAmount('')
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(null)
    const cents = parsePositiveAmount(amount)
    if (cents === null) return setError('Enter an amount more than 0.')
    if (fromPerson && !who.trim()) return setError('Enter who gave the money.')
    setError(null)
    if (source) {
      const type: IncomeType = source.sourceId === 'allowance' ? 'allowance' : 'salary'
      addIncome(sheetId, { date, sourceId: source.sourceId, type, amount: cents, toAccount: to, note: note.trim() })
      setSaved(`Saved ${source.label} ${formatPeso(cents)}.`)
    } else if (fromPerson) {
      addIncome(sheetId, { date, sourceId: '', type: kind as IncomeType, amount: cents, toAccount: to, note: [`From ${who.trim()}`, note.trim()].filter(Boolean).join(' · ') })
      setSaved(`Saved ${formatPeso(cents)} from ${who.trim()}.`)
      setAmount('')
      setWho('')
    } else {
      addIncome(sheetId, { date, sourceId: '', type: kind as IncomeType, amount: cents, toAccount: to, note: note.trim() })
      setSaved(`Saved income ${formatPeso(cents)}.`)
      setAmount('')
    }
    setNote('')
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Chips
        label="What"
        options={[...sources.map((s) => ({ value: s.sourceId, label: s.label })), ...EXTRA, ...FROM_PERSON, { value: OTHER, label: 'Other' }]}
        value={kind}
        onChange={pick}
      />
      <Field label="Amount received (₱)" htmlFor="in-amount">
        <AmountInput id="in-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      {fromPerson && (
        <Field label="From" htmlFor="in-who">
          <TextInput id="in-who" value={who} onChange={(e) => setWho(e.target.value)} placeholder="e.g. Tita" />
        </Field>
      )}
      <Chips label="Received in" options={accounts.map((a) => ({ value: a.accountId, label: a.label }))} value={to} onChange={setTo} />
      <Field label="Date" htmlFor="in-date">
        <TextInput id="in-date" type="date" value={date} max={fromPerson ? todayIso() : undefined} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Note (optional)" htmlFor="in-note">
        <TextInput id="in-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {fromPerson && <p className="text-sm text-slate-600">Adds to the account balance. Not counted in your monthly income for the plan.</p>}
      {extra && <p className="text-sm text-slate-600">Plan tip: extra income goes to the carried card balance first, then to savings.</p>}
      <Button type="submit" className="w-full">
        Save money in
      </Button>
      <ErrorNote message={error} />
      <SuccessNote message={saved} />
    </form>
  )
}
