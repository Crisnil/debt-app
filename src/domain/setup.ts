import { moneyAccounts } from './accounts'
import type { Workbook } from './types'

export type SetupStep = { key: string; label: string; detail: string; to: string; done: boolean }

/** First steps for a new sheet. A sheet already in use has them all done, so the list does not show. */
export function setupSteps(wb: Workbook): SetupStep[] {
  return [
    {
      key: 'accounts',
      label: 'Add your bank and e-wallet accounts',
      detail: 'With their balance today, e.g. payroll account, savings, GCash',
      to: '/settings',
      done: moneyAccounts(wb).filter((a) => a.active && a.type !== 'cash').length > 0,
    },
    { key: 'cards', label: 'Add your credit cards', detail: 'Skip this if you have none', to: '/settings', done: wb.cards.length > 0 },
    { key: 'income', label: 'Add your salary', detail: 'Amount, paydays, and the account it goes to', to: '/settings', done: wb.incomeSources.length > 0 },
    {
      key: 'goal',
      label: 'Set your savings goal',
      detail: 'How much to save each month',
      to: '/settings',
      done: Boolean(wb.settings.savings_goal_monthly?.value),
    },
  ]
}
