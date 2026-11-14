import { Link, useParams, useSearchParams } from 'react-router-dom'
import { reconcileCard } from '../../domain/reconcile'
import { Chips } from '../../ui/form'
import { WithWorkbook } from '../WithWorkbook'
import { CheckStatement } from './CheckStatement'
import { PasteStatement } from './PasteStatement'
import { PaymentForm } from './PaymentForm'
import { StatementLineForm } from './StatementLineForm'

const tabs = [
  { value: 'check', label: 'Check' },
  { value: 'paste', label: 'Paste statement' },
  { value: 'pay', label: 'Pay card' },
  { value: 'line', label: 'Add one line' },
] as const

type Tab = (typeof tabs)[number]['value']

export function CardPage() {
  const { cardId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (tabs.find((t) => t.value === params.get('tab'))?.value ?? 'check') as Tab

  return (
    <WithWorkbook title="Card">
      {(sheetId, workbook) => {
        const card = workbook.cards.find((c) => c.cardId === cardId)
        if (!card) return <p className="text-slate-600">Card not found.</p>
        const r = reconcileCard(workbook, cardId)
        const toCheck = r.probable.length + r.unlogged.length + r.notOnStatement.length
        const options = tabs
          .filter((t) => card.sheetTab || (t.value !== 'paste' && t.value !== 'line'))
          .map((t) => ({ value: t.value as Tab, label: t.value === 'check' && toCheck > 0 ? `Check · ${toCheck}` : t.label }))
        return (
          <section className="max-w-2xl space-y-4">
            <Link to="/stats?tab=cards" className="text-sm text-green-900 underline">
              ← Cards
            </Link>
            <h1 className="text-2xl font-semibold text-slate-900">{card.name}</h1>
            {card.sheetTab && !(workbook.headers[card.sheetTab] ?? []).includes('txn_id') && (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                Tab “{card.sheetTab}” has no <code>txn_id</code> column, so matches cannot be saved. Add a column named <code>txn_id</code> at the end of the tab.
              </p>
            )}
            <Chips label="Show" options={options} value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} />
            {/* key: reset the form when the card or tab changes */}
            {tab === 'check' && <CheckStatement key={`check-${cardId}`} sheetId={sheetId} workbook={workbook} cardId={cardId} />}
            {tab === 'paste' && <PasteStatement key={`paste-${cardId}`} sheetId={sheetId} workbook={workbook} cardId={cardId} />}
            {tab === 'pay' && <PaymentForm key={`pay-${cardId}`} sheetId={sheetId} workbook={workbook} cardId={cardId} />}
            {tab === 'line' && <StatementLineForm key={`line-${cardId}`} sheetId={sheetId} workbook={workbook} cardId={cardId} />}
          </section>
        )
      }}
    </WithWorkbook>
  )
}
