import { useState, type ReactNode } from 'react'
import { saveCheckCount, saveExpense, saveLine, VOID_REASONS, voidBalanceCheck, voidExpense, voidLine, type VoidReason } from '../../data/actions'
import { accountLabel, expenseCategories, paidFromAccounts } from '../../domain/accounts'
import { type SpendingItem } from '../../domain/reconcile'
import type { StatementLine, Transaction, Workbook } from '../../domain/types'
import { formatPeso, toPesos } from '../../lib/money'
import { useSheetEdit } from '../../state/hooks'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'
import { Chips, Field, Select, TextInput } from '../../ui/form'
import { parsePositiveAmount } from '../add/parseAmount'

const shortDay = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

type Saved = (message: string) => void
type SheetEdit = ReturnType<typeof useSheetEdit>

/** Category choices, with the current one kept even when it is not in the Categories tab. */
function CategorySelect({ workbook, id, current, value, onChange }: { workbook: Workbook; id: string; current: string; value: string; onChange: (v: string) => void }) {
  const names = expenseCategories(workbook)
  const options = current && !names.includes(current) ? [current, ...names] : names
  return (
    <Field label="Category" htmlFor={id}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">No category</option>
        {options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
    </Field>
  )
}

/** Amount typed without a sign. The sign of the original stays (a refund line stays below 0). */
function signedAmount(text: string, original: number): number | null {
  const typed = parsePositiveAmount(text.replace(/^-/, ''))
  return typed === null ? null : original < 0 ? -typed : typed
}

const waiting = <p className="text-sm text-amber-900">Saved on this phone, not in the sheet yet. Wait until it is saved to change it.</p>

/** Void with a reason, after a confirm. The row stays in the sheet, marked void. */
function VoidBox({ what, edit, onVoid, children }: { what: string; edit: SheetEdit; onVoid: (reason: VoidReason) => void; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<VoidReason>(VOID_REASONS[0])
  if (!open) {
    return (
      <button type="button" className="text-sm text-red-800 underline" onClick={() => setOpen(true)}>
        Void this {what}
      </button>
    )
  }
  return (
    <div role="alertdialog" aria-label={`Void this ${what}`} className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-900">
      <Chips label="Why?" options={VOID_REASONS.map((r) => ({ value: r, label: r }))} value={reason} onChange={setReason} />
      <p>The app stops counting it. It stays in the sheet, marked void.</p>
      {children}
      <div className="flex gap-2">
        <Button variant="danger" disabled={edit.busy} onClick={() => onVoid(reason)}>
          Void
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Keep
        </Button>
      </div>
    </div>
  )
}

/** Correct the amount, description, and category of a logged expense (date, Paid from, and note under More), or void it. */
function ExpenseCorrection({ workbook, txn, matched, onSaved }: { workbook: Workbook; txn: Transaction; matched: boolean; onSaved: Saved }) {
  const edit = useSheetEdit()
  const [amount, setAmount] = useState(toPesos(Math.abs(txn.amount)).toFixed(2))
  const [merchant, setMerchant] = useState(txn.merchant)
  const [category, setCategory] = useState(txn.category)
  const [date, setDate] = useState(txn.date)
  const [methodId, setMethodId] = useState(txn.methodId)
  const [note, setNote] = useState(txn.note)
  const accounts = paidFromAccounts(workbook)
  if (!txn.row) return waiting

  async function save() {
    const cents = signedAmount(amount, txn.amount)
    if (cents === null) return edit.fail('Enter an amount more than 0.')
    const message = `Corrected ${merchant.trim() || 'the expense'}.`
    const ok = await edit.run(message, (sheetId, wb, token) =>
      saveExpense(sheetId, wb, txn, { date, amount: cents, merchant: merchant.trim(), category, methodId, note: note.trim() }, token),
    )
    if (ok) onSaved(message)
  }

  async function voidIt(reason: VoidReason) {
    const message = `Voided ${txn.merchant || 'the expense'} (${reason.toLowerCase()}).`
    if (await edit.run(message, (sheetId, wb, token) => voidExpense(sheetId, wb, txn, reason, token))) onSaved(message)
  }

  const breaksMatch = matched && (date !== txn.date || signedAmount(amount, txn.amount) !== txn.amount)
  return (
    <div className="space-y-3">
      <Field label="Amount (₱)" htmlFor="fix-amount">
        <TextInput id="fix-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Description" htmlFor="fix-merchant">
        <TextInput id="fix-merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Where, or what" />
      </Field>
      <CategorySelect workbook={workbook} id="fix-category" current={txn.category} value={category} onChange={setCategory} />
      <details className="rounded-lg bg-slate-50 p-2 text-sm">
        <summary className="cursor-pointer text-slate-700">More details: date, Paid from, note</summary>
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date" htmlFor="fix-date">
              <TextInput id="fix-date" type="date" value={date} onChange={(e) => setDate(e.target.value || txn.date)} />
            </Field>
            <Field label="Paid from" htmlFor="fix-method">
              <Select id="fix-method" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
                {!accounts.some((a) => a.accountId === txn.methodId) && <option value={txn.methodId}>{accountLabel(workbook, txn.methodId)}</option>}
                {accounts.map((a) => (
                  <option key={a.accountId} value={a.accountId}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Note" htmlFor="fix-note">
            <TextInput id="fix-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </details>
      {breaksMatch && <p className="text-sm text-amber-900">! It is matched to a statement line. A new amount or date can break the match.</p>}
      <Button className="w-full" disabled={edit.busy} onClick={() => void save()}>
        {edit.busy ? 'Saving…' : 'Save correction'}
      </Button>
      <VoidBox what="expense" edit={edit} onVoid={(r) => void voidIt(r)}>
        {txn.payableId && <p>It pays a bill: the bill shows as not paid again.</p>}
        {matched && <p>The purchase still counts from the card statement.</p>}
      </VoidBox>
      <ErrorNote message={edit.error} />
    </div>
  )
}

/** Correct a card statement line that was pasted or read wrong, or void it (pasted twice, not on the statement). */
function LineCorrection({ workbook, line, matched, onSaved }: { workbook: Workbook; line: StatementLine; matched: boolean; onSaved: Saved }) {
  const edit = useSheetEdit()
  const [amount, setAmount] = useState(toPesos(Math.abs(line.amount)).toFixed(2))
  const [description, setDescription] = useState(line.description)
  const [category, setCategory] = useState(line.category)
  if (!line.row) return waiting

  async function save() {
    const cents = signedAmount(amount, line.amount)
    if (cents === null) return edit.fail('Enter an amount more than 0.')
    if (!description.trim()) return edit.fail('Enter the description from the statement.')
    const message = `Corrected ${description.trim()}.`
    if (await edit.run(message, (sheetId, wb, token) => saveLine(sheetId, wb, line, { amount: cents, description: description.trim(), category }, token))) onSaved(message)
  }

  async function voidIt(reason: VoidReason) {
    const message = `Voided ${line.description} (${reason.toLowerCase()}).`
    if (await edit.run(message, (sheetId, wb, token) => voidLine(sheetId, wb, line, reason, token))) onSaved(message)
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Card statement line. Correct it only when it does not match the bank statement.</p>
      <Field label="Amount (₱)" htmlFor="fix-line-amount">
        <TextInput id="fix-line-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Description" htmlFor="fix-line-description">
        <TextInput id="fix-line-description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <CategorySelect workbook={workbook} id="fix-line-category" current={line.category} value={category} onChange={setCategory} />
      <Button className="w-full" disabled={edit.busy} onClick={() => void save()}>
        {edit.busy ? 'Saving…' : 'Save correction'}
      </Button>
      <VoidBox what="statement line" edit={edit} onVoid={(r) => void voidIt(r)}>
        {matched && <p>Your logged expense stays and counts on its own.</p>}
      </VoidBox>
      <ErrorNote message={edit.error} />
    </div>
  )
}

/** Not recorded spending from a balance check: stop counting it, or void the check. */
function CheckCorrection({ item, onSaved }: { item: SpendingItem; onSaved: Saved }) {
  const check = item.check!
  const edit = useSheetEdit()
  if (!check.row) return waiting

  async function stopCounting() {
    const message = 'This difference is not counted any more.'
    if (await edit.run(message, (sheetId, wb, token) => saveCheckCount(sheetId, wb, check, false, token))) onSaved(message)
  }

  async function voidIt(reason: VoidReason) {
    const message = `Voided the balance check (${reason.toLowerCase()}).`
    if (await edit.run(message, (sheetId, wb, token) => voidBalanceCheck(sheetId, wb, check, reason, token))) onSaved(message)
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        On {shortDay(check.date)} you typed {formatPeso(check.balance)}. That is {formatPeso(item.amount)} less than the app had, so it counts as spending you did
        not record. If you find the missing entries, add them, then stop counting this.
      </p>
      <Button variant="secondary" className="w-full" disabled={edit.busy} onClick={() => void stopCounting()}>
        Don&apos;t count as spending
      </Button>
      <VoidBox what="balance check" edit={edit} onVoid={(r) => void voidIt(r)}>
        <p>The balance goes back to the check before it (or the starting balance).</p>
      </VoidBox>
      <ErrorNote message={edit.error} />
    </div>
  )
}

/** A matched purchase: correct your entry by default, or the statement line instead. */
function MatchedCorrection({ workbook, item, onSaved }: { workbook: Workbook; item: SpendingItem; onSaved: Saved }) {
  const [part, setPart] = useState<'entry' | 'line'>('entry')
  return (
    <div className="space-y-3">
      {part === 'entry' ? <ExpenseCorrection workbook={workbook} txn={item.txn!} matched onSaved={onSaved} /> : <LineCorrection workbook={workbook} line={item.line!} matched onSaved={onSaved} />}
      <button type="button" className="text-sm text-green-900 underline" onClick={() => setPart(part === 'entry' ? 'line' : 'entry')}>
        {part === 'entry' ? 'Fix the statement line instead' : 'Fix your entry instead'}
      </button>
    </div>
  )
}

/** Correct or void one Spending item, by where it comes from. */
export function ItemDialogBody({ workbook, item, onSaved }: { workbook: Workbook; item: SpendingItem; onSaved: Saved }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        {shortDay(item.date)} · {accountLabel(workbook, item.methodId)} · <b className="text-slate-900">{formatPeso(item.amount)}</b>
      </p>
      {item.check ? (
        <CheckCorrection item={item} onSaved={onSaved} />
      ) : item.txn && item.line ? (
        <MatchedCorrection workbook={workbook} item={item} onSaved={onSaved} />
      ) : item.txn ? (
        <ExpenseCorrection workbook={workbook} txn={item.txn} matched={false} onSaved={onSaved} />
      ) : item.line ? (
        <LineCorrection workbook={workbook} line={item.line} matched={false} onSaved={onSaved} />
      ) : (
        <p className="text-sm text-slate-600">A cash-out from an e-wallet. Change it in the IncomeLog tab of the sheet.</p>
      )}
    </div>
  )
}
