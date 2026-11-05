import { useState, type FormEvent } from 'react'
import { addExpense, addPayable, setPayableAmount } from '../../data/actions'
import { accountLabel, cardForMethod, expenseCategories } from '../../domain/accounts'
import { billFor } from '../../domain/billing'
import { todayIso } from '../../domain/dues'
import { PAYABLE_CATEGORIES, type PayableMonth } from '../../domain/payables'
import type { Workbook } from '../../domain/types'
import { formatPeso, toPesos } from '../../lib/money'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'
import { AmountInput, Chips, Field, SuccessNote, TextInput } from '../../ui/form'
import { parsePositiveAmount } from '../add/parseAmount'

/** Pay one month of a payable. Saved as an expense linked to the payable. A card payment shows on that card's bill. */
export function PayForm({ sheetId, workbook, item, onDone }: { sheetId: string; workbook: Workbook; item: PayableMonth; onDone: () => void }) {
  const methods = workbook.accounts.filter((a) => a.active)
  const [amount, setAmount] = useState(toPesos(item.left).toFixed(2))
  const [methodId, setMethodId] = useState(methods.find((a) => a.type === 'cash')?.accountId ?? methods[0]?.accountId ?? 'cash')
  const [date, setDate] = useState(todayIso())
  const [error, setError] = useState<string | null>(null)
  const card = cardForMethod(workbook, methodId)
  const bill = card ? billFor(card, date) : null
  const isWallet = workbook.accounts.find((a) => a.accountId === methodId)?.type === 'e-wallet'

  function submit(e: FormEvent) {
    e.preventDefault()
    const cents = parsePositiveAmount(amount)
    if (cents === null) return setError('Enter an amount more than 0.')
    const p = item.payable
    addExpense(sheetId, {
      date,
      amount: cents,
      merchant: p.payee || p.name,
      category: p.category,
      methodId,
      note: `Payable: ${p.name}`,
      payableId: p.payableId,
      payableMonth: item.month,
    })
    onDone()
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-3 rounded-lg bg-slate-50 p-3" noValidate>
      <Field label="Amount paid (₱)" htmlFor={`pay-${item.payable.payableId}-${item.month}`}>
        <AmountInput id={`pay-${item.payable.payableId}-${item.month}`} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Chips label="Paid with" options={methods.map((a) => ({ value: a.accountId, label: a.label }))} value={methodId} onChange={setMethodId} />
      {card && bill && (
        <p className="text-xs text-slate-600">
          Goes on the <b>{card.name}</b> bill of {bill.statementDate}. When you paste that statement, the app suggests the match.
        </p>
      )}
      {isWallet && <p className="text-xs text-slate-600">Lowers your {accountLabel(workbook, methodId)} balance. Not counted as spending again (the load was).</p>}
      <Field label="Date" htmlFor={`payd-${item.payable.payableId}-${item.month}`}>
        <TextInput id={`payd-${item.payable.payableId}-${item.month}`} type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit">Save payment</Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <ErrorNote message={error} />
    </form>
  )
}

/** The real amount of a recurring bill for one month (for example, this month's electric bill). */
export function SetAmountForm({ sheetId, item, onDone }: { sheetId: string; item: PayableMonth; onDone: () => void }) {
  const [amount, setAmount] = useState(toPesos(item.amount).toFixed(2))
  const [error, setError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const cents = parsePositiveAmount(amount)
    if (cents === null) return setError('Enter an amount more than 0.')
    setPayableAmount(sheetId, item.payable.payableId, item.month, cents)
    onDone()
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-3 rounded-lg bg-slate-50 p-3" noValidate>
      <Field label={`Amount for this month (₱) · usual ${formatPeso(item.payable.amount)}`} htmlFor={`set-${item.payable.payableId}-${item.month}`}>
        <AmountInput id={`set-${item.payable.payableId}-${item.month}`} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit">Save amount</Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <ErrorNote message={error} />
    </form>
  )
}

/** New payable: a bill or money owed. Recurring: every month, a number of times or with no end. One-time: one due date. */
export function AddPayableForm({ sheetId, workbook }: { sheetId: string; workbook: Workbook }) {
  const categories = [...new Set([...PAYABLE_CATEGORIES, ...expenseCategories(workbook)])]
  const thisMonth = todayIso().slice(0, 7)
  const [name, setName] = useState('')
  const [payee, setPayee] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(categories[0])
  const [recurring, setRecurring] = useState(true)
  const [dueDay, setDueDay] = useState('')
  const [startMonth, setStartMonth] = useState(thisMonth)
  const [times, setTimes] = useState('')
  const [dueDate, setDueDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(null)
    const cents = parsePositiveAmount(amount)
    if (!name.trim()) return setError('Enter a name, for example "Electric".')
    if (cents === null) return setError('Enter an amount more than 0.')
    const day = recurring ? (dueDay.trim() ? Number(dueDay) : null) : Number(dueDate.slice(8, 10))
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) return setError('Enter a due day from 1 to 31.')
    const count = recurring && times.trim() ? Number(times) : null
    if (count !== null && (!Number.isInteger(count) || count < 1)) return setError('Enter how many times as a whole number, or leave it empty.')
    const start = recurring ? startMonth : dueDate.slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(start)) return setError(recurring ? 'Enter the first month.' : 'Enter the due date.')
    setError(null)
    addPayable(sheetId, { name: name.trim(), payee: payee.trim(), category, amount: cents, recurring, dueDay: day, startMonth: start, times: count, note: note.trim() })
    setSaved(`Added ${name.trim()}.`)
    setName('')
    setPayee('')
    setAmount('')
    setTimes('')
    setNote('')
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Name" htmlFor="pb-name">
          <TextInput id="pb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Electric" />
        </Field>
        <Field label="Pay to (optional)" htmlFor="pb-payee">
          <TextInput id="pb-payee" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="e.g. NORECO, Tita" />
        </Field>
      </div>
      <Field label={recurring ? 'Usual amount per month (₱)' : 'Amount (₱)'} htmlFor="pb-amount">
        <AmountInput id="pb-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Chips label="Category" options={categories.map((c) => ({ value: c, label: c }))} value={category} onChange={setCategory} />
      <Chips
        label="How often"
        options={[
          { value: 'monthly', label: 'Every month' },
          { value: 'once', label: 'One time' },
        ]}
        value={recurring ? 'monthly' : 'once'}
        onChange={(v) => setRecurring(v === 'monthly')}
      />
      {recurring ? (
        <>
          <Field label="First month" htmlFor="pb-start">
            <TextInput id="pb-start" type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Due day" htmlFor="pb-day" hint="Empty = end of month">
              <TextInput id="pb-day" inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="20" />
            </Field>
            <Field label="How many times" htmlFor="pb-times" hint="Empty = no end">
              <TextInput id="pb-times" inputMode="numeric" value={times} onChange={(e) => setTimes(e.target.value)} placeholder="5" />
            </Field>
          </div>
        </>
      ) : (
        <Field label="Due date" htmlFor="pb-due">
          <TextInput id="pb-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      )}
      <Field label="Note (optional)" htmlFor="pb-note">
        <TextInput id="pb-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full">
        Add payable
      </Button>
      <ErrorNote message={error} />
      <SuccessNote message={saved} />
    </form>
  )
}
