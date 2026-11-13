import { NavLink, useLocation } from 'react-router-dom'

/** phone: in the bottom bar (the + button sits in the middle). wide: in the sidebar. Pages left out of the bottom bar are on More. */
const items = [
  { to: '/', label: 'Home', phone: true, wide: true },
  { to: '/cards', label: 'Cards', phone: true, wide: true },
  { to: '/bills', label: 'Bills', phone: false, wide: true },
  { to: '/transactions', label: 'Transactions', phone: true, wide: true },
  { to: '/plan', label: 'Plan', phone: false, wide: true },
  { to: '/balances', label: 'Check balances', phone: false, wide: true },
  { to: '/settings', label: 'Settings', phone: false, wide: true },
  { to: '/more', label: 'More', phone: true, wide: false },
]

/** Pages under More: the More tab stays marked on them. */
const MORE_PAGES = items.filter((i) => !i.phone).map((i) => ({ to: i.to, label: i.label }))

// Bottom bar on phones, sidebar on wide screens (lg and up).
export function MainNav() {
  const { pathname } = useLocation()
  const onMorePage = MORE_PAGES.some((p) => pathname.startsWith(p.to))
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:sticky lg:top-0 lg:inset-auto lg:h-dvh lg:w-56 lg:shrink-0 lg:border-t-0 lg:border-r lg:pb-0"
    >
      <p className="hidden px-6 pt-6 pb-4 text-lg font-semibold text-green-900 lg:block">Debt App</p>
      <ul className="mx-auto grid max-w-md grid-cols-5 lg:max-w-none lg:grid-cols-1 lg:gap-1 lg:px-3">
        {items.map((item) => [
          // Phones: an empty middle slot for the + button (AddButton), between Cards and Transactions.
          item.to === '/transactions' && <li key="add-slot" className="lg:hidden" aria-hidden="true" />,
          <li key={item.to} className={`${item.phone ? '' : 'hidden'} ${item.wide ? 'lg:block' : 'lg:hidden'}`}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block py-3 text-center text-xs sm:text-sm lg:rounded-lg lg:px-3 lg:py-2 lg:text-left ${
                  isActive || (item.to === '/more' && onMorePage) ? 'font-semibold text-green-900 lg:bg-green-50' : 'text-slate-500 lg:hover:bg-slate-50'
                }`
              }
            >
              {item.label}
            </NavLink>
          </li>,
        ])}
      </ul>
    </nav>
  )
}
