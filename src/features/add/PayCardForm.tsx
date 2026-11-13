import { useState } from 'react'
import type { Workbook } from '../../domain/types'
import { Chips } from '../../ui/form'
import { PaymentForm } from '../cards/PaymentForm'

/** Pay a credit card from the Add page: choose the card, then the same form as on the card's page. */
export function PayCardForm({ sheetId, workbook }: { sheetId: string; workbook: Workbook }) {
  const cards = workbook.cards.filter((c) => c.active)
  const [cardId, setCardId] = useState(cards[0]?.cardId ?? '')

  if (cards.length === 0) return <p className="text-sm text-slate-600">No credit cards yet.</p>
  return (
    <div className="space-y-4">
      {cards.length > 1 && <Chips label="Card" options={cards.map((c) => ({ value: c.cardId, label: c.name }))} value={cardId} onChange={setCardId} />}
      {/* key: reset the form when the card changes */}
      <PaymentForm key={cardId} sheetId={sheetId} workbook={workbook} cardId={cardId} />
    </div>
  )
}
