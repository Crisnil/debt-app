import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AddPage } from './features/add/AddPage'
import { BalancesPage } from './features/balances/BalancesPage'
import { OtherEntriesPage } from './features/add/OtherEntriesPage'
import { CardPage } from './features/cards/CardPage'
import { CardsPage } from './features/cards/CardsPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { BillsPage } from './features/bills/BillsPage'
import { MorePage } from './features/MorePage'
import { PlanPage } from './features/plan/PlanPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { SpendingPage } from './features/spending/SpendingPage'
import { useEffect } from 'react'
import { todayIso } from './domain/dues'
import { forecastCards } from './domain/forecast'
import { badgeCount } from './domain/home'
import { useLiveWorkbook, useSync } from './state/hooks'
import { AddButton } from './ui/AddButton'
import { MainNav } from './ui/MainNav'

function SyncBar() {
  const { pending, syncing, error, syncNow } = useSync()
  if (pending === 0 && !error) return null
  return (
    <div role="status" className={`px-4 py-2 text-sm ${error ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>
      {syncing ? `Saving ${pending} to the sheet…` : `${pending} saved on this phone, not in the sheet yet.`}
      {error && <span> {error}</span>}
      {!syncing && (
        <button className="ml-2 underline" onClick={syncNow}>
          Retry
        </button>
      )}
    </div>
  )
}

/**
 * Number on the installed app's icon: bills late or due in 3 days. Works where the phone supports app badges
 * (installed app on Android, iOS 16.4+). Nothing shows otherwise.
 */
function DueBadge() {
  const { workbook } = useLiveWorkbook()
  useEffect(() => {
    if (!workbook || !('setAppBadge' in navigator)) return
    const today = todayIso()
    const count = badgeCount(workbook, forecastCards(workbook, today), today)
    void (count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {})
  }, [workbook])
  return null
}

/** Old "Check statement" links. */
function ReconcileRedirect() {
  const { cardId = '' } = useParams()
  return <Navigate to={`/cards/${cardId}`} replace />
}

export default function App() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col lg:max-w-7xl lg:flex-row">
      <MainNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <SyncBar />
        <DueBadge />
        <main className="flex-1 px-4 pt-6 pb-24 lg:px-10 lg:pt-8 lg:pb-10">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/add" element={<AddPage />} />
            <Route path="/add/other" element={<OtherEntriesPage />} />
            <Route path="/cards" element={<CardsPage />} />
            <Route path="/cards/:cardId" element={<CardPage />} />
            <Route path="/reconcile/:cardId" element={<ReconcileRedirect />} />
            <Route path="/bills" element={<BillsPage />} />
            <Route path="/transactions" element={<SpendingPage />} />
            <Route path="/spending" element={<Navigate to="/transactions" replace />} />
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/balances" element={<BalancesPage />} />
            <Route path="/more" element={<MorePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <AddButton />
      </div>
    </div>
  )
}
