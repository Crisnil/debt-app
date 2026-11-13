import { useSearchParams } from 'react-router-dom'
import { Chips } from '../../ui/form'
import { WithWorkbook } from '../WithWorkbook'
import { ExpenseForm } from './ExpenseForm'
import { MoneyInForm } from './MoneyInForm'
import { MoveMoneyForm } from './MoveMoneyForm'
import { PayCardForm } from './PayCardForm'

const kinds = [
  { value: 'expense', label: 'Expense', title: 'Add expense' },
  { value: 'in', label: 'Money in', title: 'Money in' },
  { value: 'move', label: 'Move money', title: 'Move money' },
  { value: 'pay', label: 'Pay card', title: 'Pay a card' },
] as const

type Kind = (typeof kinds)[number]['value']

/** Every entry in one place: ?type=expense (default), in, move, or pay. ?to= picks the account to move money to; ?card= the card to pay. */
export function AddPage() {
  const [params, setParams] = useSearchParams()
  const kind = kinds.find((k) => k.value === params.get('type')) ?? kinds[0]
  const to = params.get('to') ?? undefined
  const card = params.get('card') ?? undefined

  return (
    <WithWorkbook title={kind.title}>
      {(sheetId, workbook) => (
        <section className="max-w-xl space-y-5">
          <h1 className="text-2xl font-semibold text-slate-900">{kind.title}</h1>
          <Chips<Kind> label="What" options={kinds.map((k) => ({ value: k.value, label: k.label }))} value={kind.value} onChange={(v) => setParams({ type: v }, { replace: true })} />
          {/* key: reset the form when the type changes */}
          {kind.value === 'expense' && <ExpenseForm key="expense" sheetId={sheetId} workbook={workbook} />}
          {kind.value === 'in' && <MoneyInForm key="in" sheetId={sheetId} workbook={workbook} />}
          {kind.value === 'move' && <MoveMoneyForm key={`move-${to ?? ''}`} sheetId={sheetId} workbook={workbook} initialTo={to} />}
          {kind.value === 'pay' && <PayCardForm key={`pay-${card ?? ''}`} sheetId={sheetId} workbook={workbook} initialCard={card} />}
        </section>
      )}
    </WithWorkbook>
  )
}
