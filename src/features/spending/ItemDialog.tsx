import { useState } from 'react'
import { addExpense, deleteBalanceCheck, deleteExpense, saveCheckCount, saveExpense, saveLineCategory } from '../../data/actions'
import { accountLabel, expenseCategories, paidFromAccounts } from '../../domain/accounts'
import { todayIso } from '../../domain/dues'
import { type SpendingItem } from '../../domain/reconcile'
import type { Workbook } from '../../domain/types'
import { formatPeso, toPesos } from '../../lib/money'
import { useSheetEdit } from '../../state/hooks'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'
import { Field, Select, TextInput } from '../../ui/form'
import { parsePositiveAmount } from '../add/parseAmount'

const shortDay = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
const section = 'space-y-3 border-t border-slate-100 pt-3'

/** Category choices, with the current one kept even when it is not in the Categories tab. */
function categoryOptions(wb: Workbook, current: string): string[] {
  const names = expenseCategories(wb)
  return current && !names.includes(current) ? [current, ...names] : names
}

const waiting = <p className="text-sm text-amber-900">Saved on this phone, not in the sheet yet. Wait until it is saved to edit it.</p>

/** Edit or delete a logged expense. */
function ExpenseEditor({ workbook, item, onSaved }: { workbook: Workbook; item: SpendingItem; onSaved: (message: string) => void }) {
  const txn = item.txn!
  const edit = useSheetEdit()
  const [amount, setAmount] = useState(toPesos(txn.amount).toFixed(2))
  const [date, setDate] = useState(txn.date)
  const [merchant, setMerchant] = useState(txn.merchant)
  const [category, setCategory] = useState(txn.category)
  const [methodId, setMethodId] = useState(txn.methodId)
  const [note, setNote] = useState(txn.note)
  const [confirming, setConfirming] = useState(false)
  const accounts = paidFromAccounts(workbook)
  const matched = item.source === 'both'
  const isCorrection = txn.amount < 0

  if (!txn.row) return waiting

  async function save() {
    const typed = parsePositiveAmount(amount.replace(/^-/, ''))
    if (typed === null) return edit.fail('Enter an amount more than 0.')
    const cents = isCorrection ? -typed : typed
    const message = `Saved ${merchant.trim() || 'the expense'}.`
    const ok = await edit.run(message, (sheetId, wb, token) =>
      saveExpense(sheetId, wb, txn, { date, amount: cents, merchant: merchant.trim(), category, methodId, note: note.trim() }, token),
    )
    if (ok) onSaved(message)
  }

  async function remove() {
    const message = `Deleted ${txn.merchant || 'the expense'}.`
    if (await edit.run(message, (sheetId, wb, token) => deleteExpense(sheetId, wb, txn, token))) onSaved(message)
  }

  const breaksMatch = matched && (date !== txn.date || amount !== toPesos(txn.amount).toFixed(2))
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label={isCorrection ? 'Correction (₱, taken off)' : 'Amount (₱)'} htmlFor="it-amount">
          <TextInput id="it-amount" inputMode="decimal" value={amount.replace(/^-/, '')} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Date" htmlFor="it-date">
          <TextInput id="it-date" type="date" value={date} onChange={(e) => setDate(e.target.value || txn.date)} />
        </Field>
      </div>
      <Field label="Where" htmlFor="it-merchant">
        <TextInput id="it-merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Category" htmlFor="it-category">
          <Select id="it-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">No category</option>
            {categoryOptions(workbook, txn.category).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Paid from" htmlFor="it-method">
          <Select id="it-method" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
            {!accounts.some((a) => a.accountId === txn.methodId) && <option value={txn.methodId}>{accountLabel(workbook, txn.methodId)}</option>}
            {accounts.map((a) => (
              <option key={a.accountId} value={a.accountId}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Note" htmlFor="it-note">
        <TextInput id="it-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {breaksMatch && <p className="text-sm text-amber-900">! It is matched to a statement line. A new amount or date can break the match.</p>}
      <Button className="w-full" disabled={edit.busy} onClick={() => void save()}>
        {edit.busy ? 'Saving…' : 'Save changes'}
      </Button>
      {confirming ? (
        <div role="alertdialog" aria-label="Delete this expense" className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-900">
          <p>Delete this expense? It stays in the sheet, marked deleted.</p>
          {txn.payableId && <p>It pays a bill: the bill shows as not paid again.</p>}
          {matched && <p>The purchase still counts from the card statement.</p>}
          <div className="flex gap-2">
            <Button variant="danger" disabled={edit.busy} onClick={() => void remove()}>
              Delete
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" className="text-sm text-red-800 underline" onClick={() => setConfirming(true)}>
          Delete this expense
        </button>
      )}
      <ErrorNote message={edit.error} />
    </div>
  )
}

/** A card statement line: only the category can change. The bank's description and amount stay. */
function LineEditor({ workbook, item, onSaved }: { workbook: Workbook; item: SpendingItem; onSaved: (message: string) => void }) {
  const line = item.line!
  const edit = useSheetEdit()
  const [category, setCategory] = useState(line.category)
  if (!line.row) return waiting

  async function save() {
    const message = `Saved the category of ${line.description}.`
    if (await edit.run(message, (sheetId, wb, token) => saveLineCategory(sheetId, wb, line, category, token))) onSaved(message)
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">From the card statement. The description and amount stay as the bank shows them. For a refund or an overcharge, add a correction below.</p>
      <Field label="Category" htmlFor="it-line-category">
        <Select id="it-line-category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">No category</option>
          {categoryOptions(workbook, line.category).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Field>
      <Button className="w-full" disabled={edit.busy || category === line.category} onClick={() => void save()}>
        {edit.busy ? 'Saving…' : 'Save category'}
      </Button>
      <ErrorNote message={edit.error} />
    </div>
  )
}

/** Not recorded spending from a balance check: stop counting it, or delete the check. */
function CheckEditor({ item, onSaved }: { item: SpendingItem; onSaved: (message: string) => void }) {
  const check = item.check!
  const edit = useSheetEdit()
  const [confirming, setConfirming] = useState(false)
  if (!check.row) return waiting

  async function stopCounting() {
    const message = 'This difference is not counted any more.'
    if (await edit.run(message, (sheetId, wb, token) => saveCheckCount(sheetId, wb, check, false, token))) onSaved(message)
  }

  async function remove() {
    const message = 'Deleted the balance check.'
    if (await edit.run(message, (sheetId, wb, token) => deleteBalanceCheck(sheetId, wb, check, token))) onSaved(message)
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
      {confirming ? (
        <div role="alertdialog" aria-label="Delete this balance check" className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-900">
          <p>Delete this check? The balance goes back to the check before it (or the starting balance).</p>
          <div className="flex gap-2">
            <Button variant="danger" disabled={edit.busy} onClick={() => void remove()}>
              Delete
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" className="text-sm text-red-800 underline" onClick={() => setConfirming(true)}>
          Delete the balance check
        </button>
      )}
      <ErrorNote message={edit.error} />
    </div>
  )
}

/** A minus entry (refund, overcharge) with the same category and Paid from. Works offline: it is a new entry. */
function CorrectionForm({ sheetId, item, onSaved }: { sheetId: string; item: SpendingItem; onSaved: (message: string) => void }) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const label = item.label || 'purchase'

  function add() {
    const cents = parsePositiveAmount(amount)
    if (cents === null) return setError('Enter the amount to take off, more than 0.')
    if (item.amount > 0 && cents > item.amount) return setError(`A correction can take off up to ${formatPeso(item.amount)}.`)
    addExpense(sheetId, {
      date,
      amount: -cents,
      merchant: `Correction: ${label}`,
      category: item.category,
      methodId: item.methodId,
      note: [`Correction of ${label} (${item.date})`, note.trim()].filter(Boolean).join(' · '),
    })
    onSaved(`Added a correction of −${formatPeso(cents)}.`)
  }

  return (
    <div className={section}>
      <h3 className="font-medium text-slate-900">Add a correction</h3>
      <p className="text-xs text-slate-500">For a refund or an overcharge. It takes the amount off the same category and Paid from.</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Take off (₱)" htmlFor="it-fix-amount">
          <TextInput id="it-fix-amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Date" htmlFor="it-fix-date">
          <TextInput id="it-fix-date" type="date" value={date} onChange={(e) => setDate(e.target.value || todayIso())} />
        </Field>
      </div>
      <Field label="Note (optional)" htmlFor="it-fix-note">
        <TextInput id="it-fix-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. refund" />
      </Field>
      <Button variant="secondary" className="w-full" onClick={add}>
        Add correction
      </Button>
      <ErrorNote message={error} />
    </div>
  )
}

/** What can be changed for one Spending item, by where it comes from. */
export function ItemDialogBody({ sheetId, workbook, item, onSaved }: { sheetId: string; workbook: Workbook; item: SpendingItem; onSaved: (message: string) => void }) {
  const canCorrect = item.source !== 'check' && item.amount > 0
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        {shortDay(item.date)} · {accountLabel(workbook, item.methodId)} · <b className="text-slate-900">{formatPeso(item.amount)}</b>
      </p>
      {item.check ? (
        <CheckEditor item={item} onSaved={onSaved} />
      ) : item.txn ? (
        <ExpenseEditor workbook={workbook} item={item} onSaved={onSaved} />
      ) : item.line ? (
        <LineEditor workbook={workbook} item={item} onSaved={onSaved} />
      ) : (
        <p className="text-sm text-slate-600">A cash-out from an e-wallet. Change it in the IncomeLog tab of the sheet.</p>
      )}
      {canCorrect && <CorrectionForm sheetId={sheetId} item={item} onSaved={onSaved} />}
    </div>
  )
}
