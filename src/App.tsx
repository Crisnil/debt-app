import { Navigate, Route, Routes } from 'react-router-dom'
import { Placeholder } from './features/Placeholder'
import { BottomNav } from './ui/BottomNav'

export default function App() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <main className="flex-1 px-4 pt-6 pb-24">
        <Routes>
          <Route path="/" element={<Placeholder title="Dashboard" phase={2} detail="Dues, carried balance, and debt-free dates." />} />
          <Route path="/add" element={<Placeholder title="Add" phase={4} detail="Expense, statement line, card update, payment, installment." />} />
          <Route path="/purchases" element={<Placeholder title="Purchases" phase={5} detail="All purchases from every card and cash." />} />
          <Route path="/budget" element={<Placeholder title="Budget" phase={5} detail="This week per category vs. the weekly limit." />} />
          <Route path="/settings" element={<Placeholder title="Settings" phase={2} detail="Sign in with Google and pick your sheet." />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}
