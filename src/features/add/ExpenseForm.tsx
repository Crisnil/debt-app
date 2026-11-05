import { useMemo, useState, type FormEvent } from 'react'
import { addExpense } from '../../data/actions'
import { accountLabel, cardForMethod, expenseCategories, paidFromAccounts } from '../../domain/accounts'
import { billFor } from '../../domain/billing'
import { todayIso } from '../../domain/dues'
import type { Workbook } from '../../domain/types'
import { formatPeso } from '../../lib/money'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'
import { AmountInput, Chips, Field, SuccessNote, TextInput } from '../../ui/form'
import { parsePositiveAmount } from './parseAmount'

const LAST_METHOD_KEY = 'debt-app.last-paid-from'

/** Quick expense: amount and "Paid from" are enough. The rest is under "More details". */
export function ExpenseForm({ sheetId, workbook }: { sheetId: string; workbook: Workbook }) {
  const methods = paidFromAccounts(workbook)
  const categories = expenseCategories(workbook)
  const defaultCategory = categories.includes('Other') ? 'Other' : (categories[0] ?? 'Other')
  const lastMethod = localStorage.getItem(LAST_METHOD_KEY) ?? ''
  const [amount, setAmount] = useState('')
  const [methodId, setMethodId] = useState(methods.some((a) => a.accountId === lastMethod) ? lastMethod : (methods[0]?.accountId ?? 'cash'))
  const [merchant, setMerchant] = useState('')
  const [category, setCategory] = useState(defaultCategory)
  const [date, setDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const merchants = useMemo(() => [...new Set(workbook.transactions.map((t) => t.merchant).filter(Boolean))].slice(-50), [workbook.transactions])
  const card = cardForMethod(workbook, methodId)
  const bill = card ? billFor(card, date) : null

  function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(null)
    const cents = parsePositiveAmount(amount)
    if (cents === null) return setError('Enter an amount more than 0.')
    setError(null)
    addExpense(sheetId, { date, amount: cents, merchant: merchant.trim(), category, methodId, note: note.trim() })
    localStorage.setItem(LAST_METHOD_KEY, methodId)
    setSaved(`Saved ${formatPeso(cents)} · ${accountLabel(workbook, methodId)}${merchant.trim() ? ` · ${merchant.trim()}` : ''}.`)
    setAmount('')
    setMerchant('')
    setCategory(defaultCategory)
    setDate(todayIso())
    setNote('')
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Amount (₱)" htmlFor="exp-amount">
        <AmountInput id="exp-amount" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Chips label="Paid from" options={methods.map((a) => ({ value: a.accountId, label: a.label }))} value={methodId} onChange={setMethodId} />
      {bill && card && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Goes on the <b>{card.name}</b> bill of {bill.statementDate}, due {bill.dueDate}.
        </p>
      )}
      <details className="rounded-lg border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          More details <span className="font-normal text-slate-500">· {category} · {date === todayIso() ? 'today' : date}</span>
        </summary>
        <div className="mt-3 space-y-4">
          <Field label="Where (optional)" htmlFor="exp-merchant">
            <TextInput id="exp-merchant" list="merchant-list" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. Savemore" />
            <datalist id="merchant-list">
              {merchants.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <Chips label="Category" options={categories.map((c) => ({ value: c, label: c }))} value={category} onChange={setCategory} />
          <Field label="Date" htmlFor="exp-date">
            <TextInput id="exp-date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Note (optional)" htmlFor="exp-note">
            <TextInput id="exp-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </details>
      <Button type="submit" className="w-full">
        Save expense
      </Button>
      <ErrorNote message={error} />
      <SuccessNote message={saved} />
    </form>
  )
}
