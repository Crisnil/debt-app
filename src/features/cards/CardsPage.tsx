import { Link } from 'react-router-dom'
import { reconcileCard } from '../../domain/reconcile'
import { WithWorkbook } from '../WithWorkbook'

export function CardsPage() {
  return (
    <WithWorkbook title="Cards">
      {(_, workbook) => (
        <section className="max-w-2xl space-y-4">
          <h1 className="text-2xl font-semibold text-slate-900">Cards</h1>
          <ul className="space-y-2">
            {workbook.cards
              .filter((c) => c.active)
              .map((card) => {
                const r = reconcileCard(workbook, card.cardId)
                const toCheck = r.probable.length + r.unlogged.length + r.notOnStatement.length
                return (
                  <li key={card.cardId}>
                    <Link to={`/cards/${card.cardId}`} className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
                      <span>
                        <span className="font-medium text-slate-900">{card.name}</span>
                        <span className="block text-sm text-slate-500">
                          {r.latestStatement ? `Latest statement ${r.latestStatement}` : 'No statement lines yet'}
                          {r.unbilled.length > 0 && ` · ${r.unbilled.length} not billed yet`}
                        </span>
                      </span>
                      {toCheck > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-sm text-amber-900">{toCheck} to check</span>}
                    </Link>
                  </li>
                )
              })}
          </ul>
        </section>
      )}
    </WithWorkbook>
  )
}
