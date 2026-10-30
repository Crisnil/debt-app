import { useState, type FormEvent } from 'react'
import { addStatementLine } from '../../data/actions'
import { nextBill } from '../../domain/billing'
import { todayIso } from '../../domain/dues'
import { formatForBank, parseStatementLine } from '../../domain/statementParser'
import type { LineType, Workbook } from '../../domain/types'
import { formatPeso, toPesos } from '../../lib/money'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'
import { AmountInput, Chips, Field, Select, SuccessNote, TextInput } from '../../ui/form'
import { parsePositiveAmount } from './parseAmount'

const types: { value: LineType; label: string }[] = [
  { value: 'straight', label: 'Purchase' },
  { value: 'installment', label: 'Installment' },
  { value: 'payment', label: 'Payment' },
  { value: 'credit', label: 'Credit/refund' },
  { value: 'interest', label: 'Interest' },
  { value: 'fee', label: 'Fee' },
]

const isCredit = (t: LineType) => t === 'payment' || t === 'credit'

export function StatementLineForm({ sheetId, workbook }: { sheetId: string; workbook: Workbook }) {
  const cards = workbook.cards.filter((c) => c.active && c.sheetTab)
  const [cardId, setCardId] = useState(cards[0]?.cardId ?? '')
  const card = cards.find((c) => c.cardId === cardId)
  const latest = workbook.lines.filter((l) => l.cardId === cardId).reduce((max, l) => (l.statementDate > max ? l.statementDate : max), '')
  const [statementDate, setStatementDate] = useState(() => (card && latest ? (nextBill(card, latest)?.statementDate ?? todayIso()) : todayIso()))
  const [raw, setRaw] = useState('')
  const [postDate, setPostDate] = useState('')
  const [txnDate, setTxnDate] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<LineType>('straight')
  const [amount, setAmount] = useState('')
  const [termNo, setTermNo] = useState('')
  const [totalTerms, setTotalTerms] = useState('')
  const [category, setCategory] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  function pickCard(id: string) {
    setCardId(id)
    const c = cards.find((x) => x.cardId === id)
    const last = workbook.lines.filter((l) => l.cardId === id).reduce((max, l) => (l.statementDate > max ? l.statementDate : max), '')
    if (c && last) setStatementDate(nextBill(c, last)?.statementDate ?? statementDate)
  }

  function readPasted() {
    const parsed = parseStatementLine(raw, formatForBank(card?.bank ?? ''), statementDate)
    if (!parsed) return setError('Could not read this line. Fill in the fields below.')
    setError(null)
    setPostDate(parsed.postDate)
    setTxnDate(parsed.txnDate)
    setDescription(parsed.description)
    setType(parsed.type)
    setAmount(toPesos(Math.abs(parsed.amount)).toFixed(2))
    setTermNo(parsed.termNo?.toString() ?? '')
    setTotalTerms(parsed.totalTerms?.toString() ?? '')
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(null)
    const cents = parsePositiveAmount(amount)
    if (cents === null) return setError('Enter an amount more than 0.')
    if (!description.trim()) return setError('Enter the description.')
    if (!postDate) return setError('Enter the post date.')
    const n = type === 'installment' ? Number(termNo) : null
    const m = type === 'installment' ? Number(totalTerms) : null
    if (type === 'installment' && (!n || !m || n > m)) return setError('Enter the installment term, e.g. 3 of 6.')
    setError(null)
    const signed = isCredit(type) ? -cents : cents
    addStatementLine(sheetId, workbook, cardId, {
      statementDate,
      postDate,
      txnDate: txnDate || postDate,
      description: description.trim(),
      type,
      amount: signed,
      termNo: n,
      totalTerms: m,
      category: isCredit(type) ? '' : category,
    })
    setSaved(`Saved ${formatPeso(signed)} · ${description.trim()}.`)
    setRaw('')
    setPostDate('')
    setTxnDate('')
    setDescription('')
    setAmount('')
    setTermNo('')
    setTotalTerms('')
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Chips label="Card" options={cards.map((c) => ({ value: c.cardId, label: c.name }))} value={cardId} onChange={pickCard} />
      <Field label="Statement date (cut-off)" htmlFor="sl-stmt">
        <TextInput id="sl-stmt" type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} />
      </Field>
      <Field label="Paste one statement line (optional)" htmlFor="sl-raw" hint="Example: 10/09 08/09 INSTL 3/6 SAMPLE STORE 2,499.67">
        <div className="flex gap-2">
          <TextInput id="sl-raw" value={raw} onChange={(e) => setRaw(e.target.value)} />
          <Button variant="secondary" className="mt-1 shrink-0" disabled={!raw.trim()} onClick={readPasted}>
            Read
          </Button>
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Post date" htmlFor="sl-post">
          <TextInput id="sl-post" type="date" value={postDate} onChange={(e) => setPostDate(e.target.value)} />
        </Field>
        <Field label="Purchase date" htmlFor="sl-txn">
          <TextInput id="sl-txn" type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Description" htmlFor="sl-desc">
        <TextInput id="sl-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Chips label="Type" options={types} value={type} onChange={setType} />
      <Field label="Amount (₱)" htmlFor="sl-amount" hint={isCredit(type) ? 'Saved as a negative amount (money back to the card).' : undefined}>
        <AmountInput id="sl-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      {type === 'installment' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Term" htmlFor="sl-n">
            <TextInput id="sl-n" inputMode="numeric" value={termNo} onChange={(e) => setTermNo(e.target.value)} placeholder="3" />
          </Field>
          <Field label="of" htmlFor="sl-m">
            <TextInput id="sl-m" inputMode="numeric" value={totalTerms} onChange={(e) => setTotalTerms(e.target.value)} placeholder="6" />
          </Field>
        </div>
      )}
      {!isCredit(type) && (
        <Field label="Category" htmlFor="sl-cat">
          <Select id="sl-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">—</option>
            {workbook.categories.map((c) => (
              <option key={c.category} value={c.category}>
                {c.category}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Button type="submit" className="w-full">
        Save statement line
      </Button>
      <ErrorNote message={error} />
      <SuccessNote message={saved} />
    </form>
  )
}
