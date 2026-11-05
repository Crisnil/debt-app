import { Link, useLocation } from 'react-router-dom'

/** Round "+" button above the bottom bar on phones. Wide screens have "+ Add expense" in the sidebar. Home has its own buttons. */
export function AddButton() {
  const { pathname } = useLocation()
  if (pathname === '/' || pathname.startsWith('/add')) return null
  return (
    <Link
      to="/add"
      aria-label="Add expense"
      className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex h-14 w-14 items-center justify-center rounded-full bg-green-900 text-3xl text-white shadow-lg active:bg-green-800 lg:hidden"
    >
      +
    </Link>
  )
}
