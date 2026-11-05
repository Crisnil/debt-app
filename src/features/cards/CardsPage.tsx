import { summarizeDues, todayIso } from '../../domain/dues'
import { forecastCards } from '../../domain/forecast'
import { reconcileCard } from '../../domain/reconcile'
import { CreditUsedBar } from '../../ui/charts/CreditUsed'
import { WithWorkbook } from '../WithWorkbook'
import { CardRow } from './CardSummary'

/** Each card: credit used, what is due, the next bill, and a link to its page. Soonest due first. */
export function CardsPage() {
  return (
    <WithWorkbook title="Cards">
      {(_, workbook) => {
        const today = todayIso()
        const dues = summarizeDues(workbook, today)
        const forecasts = forecastCards(workbook, today)
        return (
          <section className="space-y-4">
            <h1 className="text-2xl font-semibold text-slate-900">Cards</h1>
            <ul className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
              {dues.cards.map((c) => {
                const r = reconcileCard(workbook, c.card.cardId)
                const forecast = forecasts.find((f) => f.card.cardId === c.card.cardId)
                const next = forecast?.bills.find((b) => b.statementLeft === 0)
                return (
                  <CardRow key={c.card.cardId} c={c} next={next} toCheck={r.probable.length + r.unlogged.length + r.notOnStatement.length}>
                    {forecast && (
                      <div className="mt-3">
                        <CreditUsedBar forecast={forecast} showName={false} />
                      </div>
                    )}
                  </CardRow>
                )
              })}
            </ul>
          </section>
        )
      }}
    </WithWorkbook>
  )
}
