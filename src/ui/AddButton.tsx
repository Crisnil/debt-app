import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
)

// Receipt, peso sign, and money coming in (arrow into a tray).
const ACTIONS = [
  { to: '/add/other?type=received', label: 'Money received', icon: icon(<path d="M12 3v11m0 0-4-4m4 4 4-4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />) },
  { to: '/add/other?type=save', label: 'Add savings', icon: <span className="text-lg font-semibold" aria-hidden="true">₱</span> },
  { to: '/add', label: 'Add expense', icon: icon(<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6m-6 4h3" />) },
]

/**
 * Round + button in the bottom-right corner. Tap it to open three actions above it; the + turns into ×.
 * Tap ×, tap outside, or press Escape to close. Hidden on the Add pages.
 */
export function AddButton() {
  const { pathname, search } = useLocation()
  const [open, setOpen] = useState(false)

  // Close after moving to another page.
  useEffect(() => setOpen(false), [pathname, search])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (pathname.startsWith('/add')) return null
  return (
    <>
      {open && <div className="fixed inset-0 z-20 bg-slate-900/20" aria-hidden="true" onClick={() => setOpen(false)} />}
      <div className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex flex-col items-end gap-3 lg:right-8 lg:bottom-8">
        {open && (
          <ul id="add-menu" className="flex flex-col items-end gap-3" aria-label="Add">
            {ACTIONS.map((a) => (
              <li key={a.to}>
                <Link to={a.to} className="flex items-center gap-3" onClick={() => setOpen(false)}>
                  <span className="rounded-md bg-white px-2.5 py-1 text-sm font-medium text-slate-800 shadow">{a.label}</span>
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-green-700 text-white shadow-md active:bg-green-800">{a.icon}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          aria-label={open ? 'Close add menu' : 'Add'}
          aria-expanded={open}
          aria-controls="add-menu"
          onClick={() => setOpen(!open)}
          className={`flex h-14 w-14 items-center justify-center rounded-full text-3xl text-white shadow-lg ${open ? 'bg-slate-700' : 'bg-green-900 active:bg-green-800'}`}
        >
          <span aria-hidden="true">{open ? '×' : '+'}</span>
        </button>
      </div>
    </>
  )
}
