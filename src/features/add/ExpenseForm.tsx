import { useMemo, useState, type FormEvent } from 'react'
import { addExpense } from '../../data/actions'
import { cardForMethod } from '../../domain/accounts'
import { billFor } from '../../domain/billing'
import { todayIso } from '../../domain/dues'
import type { Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'
import { AmountInput, Chips, Field, SuccessNote, TextInput } from '../../ui/form'
import { parsePositiveAmount } from './parseAmount'

export function ExpenseForm({ sheetId, workbook }: { sheetId: string; workbook: Workbook }) {
  const categories = workbook.categories
  const methods = workbook.accounts.filter((a) => a.active)
  const [amount, setAmount] = useState('')
  const [merchant, setMerchant] = useState('')
  const [category, setCategory] = useState(categories[0]?.category ?? 'Other')
  const [methodId, setMethodId] = useState(categories[0]?.defaultMethod || methods[0]?.accountId || 'cash')
  const [methodTouched, setMethodTouched] = useState(false)
  const [date, setDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const merchants = useMemo(() => [...new Set(workbook.transactions.map((t) => t.merchant).filter(Boolean))].slice(-50), [workbook.transactions])
  const card = cardForMethod(workbook, methodId)
  const bill = card ? billFor(card, date) : null

  function pickCategory(value: string) {
    setCategory(value)
    const def = categories.find((c) => c.category === value)?.defaultMethod
    if (def && !methodTouched) setMethodId(def)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(null)
    const cents = parsePositiveAmount(amount)
    if (cents === null) return setError('Enter an amount more than 0.')
    if (!merchant.trim()) return setError('Enter where you bought it.')
    setError(null)
    addExpense(sheetId, { date, amount: cents, merchant: merchant.trim(), category, methodId, note: note.trim() })
    setSaved(`Saved ${formatPeso(cents)} · ${merchant.trim()}.`)
    setAmount('')
    setMerchant('')
    setNote('')
    setMethodTouched(false)
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Amount (₱)" htmlFor="exp-amount">
        <AmountInput id="exp-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Where" htmlFor="exp-merchant">
        <TextInput id="exp-merchant" list="merchant-list" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. Savemore" />
        <datalist id="merchant-list">
          {merchants.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </Field>
      <Chips label="Category" options={categories.map((c) => ({ value: c.category, label: c.category }))} value={category} onChange={pickCategory} />
      <Chips
        label="Paid with"
        options={methods.map((a) => ({ value: a.accountId, label: a.label }))}
        value={methodId}
        onChange={(v) => {
          setMethodId(v)
          setMethodTouched(true)
        }}
      />
      {bill && card && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Goes on the <b>{card.name}</b> bill of {bill.statementDate}, due {bill.dueDate}.
        </p>
      )}
      <Field label="Date" htmlFor="exp-date">
        <TextInput id="exp-date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Note (optional)" htmlFor="exp-note">
        <TextInput id="exp-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full">
        Save expense
      </Button>
      <ErrorNote message={error} />
      <SuccessNote message={saved} />
    </form>
  )
}
