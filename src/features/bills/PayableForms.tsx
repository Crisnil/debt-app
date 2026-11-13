import { useState, type FormEvent } from 'react'
import { addExpense, addPayable, savePayable, setPayableAmount } from '../../data/actions'
import { cardForMethod, expenseCategories } from '../../domain/accounts'
import { billFor } from '../../domain/billing'
import { todayIso } from '../../domain/dues'
import { monthsToKeep, PAYABLE_CATEGORIES, type PayableMonth } from '../../domain/payables'
import type { Workbook } from '../../domain/types'
import { toPesos } from '../../lib/money'
import { useSheetEdit } from '../../state/hooks'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'
import { AmountInput, Chips, Field, TextInput } from '../../ui/form'
import { parsePositiveAmount } from '../add/parseAmount'

/** Pay one month of a payable. Saved as an expense linked to the payable. A card payment shows on that card's bill. */
export function PayForm({ sheetId, workbook, item, onDone }: { sheetId: string; workbook: Workbook; item: PayableMonth; onDone: (message?: string) => void }) {
  const methods = workbook.accounts.filter((a) => a.active)
  const [amount, setAmount] = useState(toPesos(item.left).toFixed(2))
  const [methodId, setMethodId] = useState(methods.find((a) => a.type === 'cash')?.accountId ?? methods[0]?.accountId ?? 'cash')
  const [date, setDate] = useState(todayIso())
  const [error, setError] = useState<string | null>(null)
  const card = cardForMethod(workbook, methodId)
  const bill = card ? billFor(card, date) : null

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
    onDone(`Paid ${p.name}.`)
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Amount paid (₱)" htmlFor={`pay-${item.payable.payableId}-${item.month}`}>
        <AmountInput id={`pay-${item.payable.payableId}-${item.month}`} value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Chips label="Paid with" options={methods.map((a) => ({ value: a.accountId, label: a.label }))} value={methodId} onChange={setMethodId} />
      {card && bill && (
        <p className="text-xs text-slate-600">
          Goes on the <b>{card.name}</b> bill of {bill.statementDate}. When you paste that statement, the app suggests the match.
        </p>
      )}
      <Field label="Date" htmlFor={`payd-${item.payable.payableId}-${item.month}`}>
        <TextInput id={`payd-${item.payable.payableId}-${item.month}`} type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit">Save payment</Button>
        <Button variant="secondary" onClick={() => onDone()}>
          Cancel
        </Button>
      </div>
      <ErrorNote message={error} />
    </form>
  )
}

/**
 * Edit a payable: name, pay to, category, usual amount, due day, times, and (recurring, this month) this month's amount.
 * Changes count from this month on: earlier months with a payment keep their amount, so they stay paid.
 */
export function EditPayableForm({ workbook, item, onDone }: { workbook: Workbook; item: PayableMonth; onDone: (message?: string) => void }) {
  const p = item.payable
  const edit = useSheetEdit()
  const categories = [...new Set([p.category, ...PAYABLE_CATEGORIES, ...expenseCategories(workbook)].filter(Boolean))]
  const thisMonth = todayIso().slice(0, 7)
  const showMonth = p.recurring && item.month === thisMonth
  const [name, setName] = useState(p.name)
  const [payee, setPayee] = useState(p.payee)
  const [category, setCategory] = useState(p.category)
  const [amount, setAmount] = useState(toPesos(p.amount).toFixed(2))
  const [monthAmount, setMonthAmount] = useState(toPesos(item.amount).toFixed(2))
  const [dueDay, setDueDay] = useState(p.dueDay?.toString() ?? '')
  const [times, setTimes] = useState(p.times?.toString() ?? '')
  const id = `${p.payableId}-${item.month}`

  async function save(e: FormEvent) {
    e.preventDefault()
    const usual = parsePositiveAmount(amount)
    const forMonth = showMonth ? parsePositiveAmount(monthAmount) : usual
    const day = dueDay.trim() ? Number(dueDay) : null
    const count = p.recurring && times.trim() ? Number(times) : null
    if (!name.trim()) return edit.fail('Enter a name.')
    if (usual === null || forMonth === null) return edit.fail('Enter amounts more than 0.')
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) return edit.fail('Enter a due day from 1 to 31.')
    if (count !== null && (!Number.isInteger(count) || count < 1)) return edit.fail('Enter how many times as a whole number, or leave it empty.')
    const message = `Saved ${name.trim()}.`
    const ok = await edit.run(message, async (sheetId, wb, token) => {
      if (usual !== p.amount) for (const keep of monthsToKeep(workbook, p, todayIso())) setPayableAmount(sheetId, p.payableId, keep.month, keep.amount)
      await savePayable(sheetId, wb, p.row, { name: name.trim(), payee: payee.trim(), category, amount: usual, dueDay: day, times: count }, token)
      // This month's amount after the save would be the one set before, or else the new usual amount.
      const wouldBe = item.amountSet ? item.amount : usual
      if (showMonth && forMonth !== wouldBe) setPayableAmount(sheetId, p.payableId, item.month, forMonth)
    })
    if (ok) onDone(message)
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-3" noValidate>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Name" htmlFor={`ed-name-${id}`}>
          <TextInput id={`ed-name-${id}`} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Pay to" htmlFor={`ed-payee-${id}`}>
          <TextInput id={`ed-payee-${id}`} value={payee} onChange={(e) => setPayee(e.target.value)} />
        </Field>
      </div>
      <Chips label="Category" options={categories.map((c) => ({ value: c, label: c }))} value={category} onChange={setCategory} />
      <div className="grid grid-cols-2 gap-2">
        <Field label={p.recurring ? 'Usual amount (₱)' : 'Amount (₱)'} htmlFor={`ed-amount-${id}`}>
          <TextInput id={`ed-amount-${id}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        {showMonth && (
          <Field label="This month (₱)" htmlFor={`ed-month-${id}`} hint="For a bill that changes">
            <TextInput id={`ed-month-${id}`} inputMode="decimal" value={monthAmount} onChange={(e) => setMonthAmount(e.target.value)} />
          </Field>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Due day" htmlFor={`ed-day-${id}`} hint="Empty = end of month">
          <TextInput id={`ed-day-${id}`} inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
        </Field>
        {p.recurring && (
          <Field label="How many times" htmlFor={`ed-times-${id}`} hint="Empty = no end">
            <TextInput id={`ed-times-${id}`} inputMode="numeric" value={times} onChange={(e) => setTimes(e.target.value)} />
          </Field>
        )}
      </div>
      <p className="text-xs text-slate-500">Changes count from this month on. Months you already paid keep their amount.</p>
      <div className="flex gap-2">
        <Button type="submit" disabled={edit.busy}>
          {edit.busy ? 'Saving…' : 'Save changes'}
        </Button>
        <Button variant="secondary" disabled={edit.busy} onClick={() => onDone()}>
          Cancel
        </Button>
      </div>
      <ErrorNote message={edit.error} />
    </form>
  )
}

/** New payable: a bill or money owed. Recurring: every month, a number of times or with no end. One-time: one due date. */
export function AddPayableForm({ sheetId, workbook, onSaved }: { sheetId: string; workbook: Workbook; onSaved: (message: string) => void }) {
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

  function submit(e: FormEvent) {
    e.preventDefault()
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
    onSaved(`Added ${name.trim()}.`)
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
        Add bill
      </Button>
      <ErrorNote message={error} />
    </form>
  )
}
