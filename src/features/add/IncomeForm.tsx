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

const ONE_TIME = '__one_time__'

const typeOptions: { value: IncomeType; label: string }[] = [
  { value: 'bonus', label: 'Bonus' },
  { value: '13th_month', label: '13th month' },
  { value: 'side', label: 'Side income' },
  { value: 'other', label: 'Other' },
]

export function IncomeForm({ sheetId, workbook }: { sheetId: string; workbook: Workbook }) {
  const sources = workbook.incomeSources.filter((s) => s.active)
  const accounts = moneyAccounts(workbook).filter((a) => a.active)
  const first = sources[0]
  const [sourceId, setSourceId] = useState(first?.sourceId ?? ONE_TIME)
  const [type, setType] = useState<IncomeType>('bonus')
  const [amount, setAmount] = useState(first ? toPesos(first.amount).toFixed(2) : '')
  const [to, setTo] = useState(first?.toAccount || accounts[0]?.accountId || '')
  const [date, setDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  function pickSource(id: string) {
    setSourceId(id)
    const source = sources.find((s) => s.sourceId === id)
    if (source) {
      setAmount(toPesos(source.amount).toFixed(2))
      if (source.toAccount) setTo(source.toAccount)
    } else setAmount('')
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(null)
    const cents = parsePositiveAmount(amount)
    if (cents === null) return setError('Enter an amount more than 0.')
    setError(null)
    const source = sources.find((s) => s.sourceId === sourceId)
    const incomeType: IncomeType = source ? (source.sourceId === 'allowance' ? 'allowance' : 'salary') : type
    addIncome(sheetId, { date, sourceId: source?.sourceId ?? '', type: incomeType, amount: cents, toAccount: to, note: note.trim() })
    setSaved(`Saved income ${formatPeso(cents)}.`)
    setNote('')
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Chips
        label="Income"
        options={[...sources.map((s) => ({ value: s.sourceId, label: s.label })), { value: ONE_TIME, label: 'One-time / extra' }]}
        value={sourceId}
        onChange={pickSource}
      />
      {sourceId === ONE_TIME && <Chips label="Type" options={typeOptions} value={type} onChange={setType} />}
      <Field label="Amount received (₱)" htmlFor="inc-amount">
        <AmountInput id="inc-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Chips label="Received in" options={accounts.map((a) => ({ value: a.accountId, label: a.label }))} value={to} onChange={setTo} />
      <Field label="Date" htmlFor="inc-date">
        <TextInput id="inc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Note (optional)" htmlFor="inc-note">
        <TextInput id="inc-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {sourceId === ONE_TIME && (
        <p className="text-sm text-slate-600">Plan tip: extra income goes to the carried card balance first, then to savings.</p>
      )}
      <Button type="submit" className="w-full">
        Save income
      </Button>
      <ErrorNote message={error} />
      <SuccessNote message={saved} />
    </form>
  )
}
