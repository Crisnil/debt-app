import { Link } from 'react-router-dom'

const PAGES = [
  { to: '/bills', label: 'Bills', detail: 'Bills and payables this month, and subscriptions on cards' },
  { to: '/plan', label: 'Plan', detail: 'What we owe, bills ahead, and when we are debt-free' },
  { to: '/balances', label: 'Check balances', detail: 'Type the real balance of each account' },
  { to: '/settings', label: 'Settings', detail: 'Accounts, income, savings goal, and your sheet' },
]

/** Pages not in the bottom bar on phones. */
export function MorePage() {
  return (
    <section className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">More</h1>
      <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
        {PAGES.map((p) => (
          <li key={p.to}>
            <Link to={p.to} className="flex items-center justify-between gap-3 p-4 active:bg-slate-50">
              <span>
                <span className="block font-medium text-slate-900">{p.label}</span>
                <span className="block text-sm text-slate-600">{p.detail}</span>
              </span>
              <span aria-hidden="true" className="text-slate-400">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
