import { Navigate, Route, Routes } from 'react-router-dom'
import { AddPage } from './features/add/AddPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { Placeholder } from './features/Placeholder'
import { ReconcilePage } from './features/reconcile/ReconcilePage'
import { SettingsPage } from './features/settings/SettingsPage'
import { useSync } from './state/hooks'
import { BottomNav } from './ui/BottomNav'

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

export default function App() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <SyncBar />
      <main className="flex-1 px-4 pt-6 pb-24">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/add" element={<AddPage />} />
          <Route path="/reconcile/:cardId" element={<ReconcilePage />} />
          <Route path="/purchases" element={<Placeholder title="Purchases" phase={5} detail="All purchases from every card and cash." />} />
          <Route path="/budget" element={<Placeholder title="Budget" phase={5} detail="This week per category vs. the weekly limit." />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}
