import { NavLink } from 'react-router-dom'

const items = [
  { to: '/', label: 'Home' },
  { to: '/cards', label: 'Cards' },
  { to: '/bills', label: 'Bills' },
  { to: '/spending', label: 'Spending' },
  { to: '/plan', label: 'Plan' },
  { to: '/settings', label: 'Settings' },
]

// Bottom bar on phones, sidebar on wide screens (lg and up).
export function MainNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:sticky lg:top-0 lg:inset-auto lg:h-dvh lg:w-56 lg:shrink-0 lg:border-t-0 lg:border-r lg:pb-0"
    >
      <p className="hidden px-6 pt-6 pb-4 text-lg font-semibold text-green-900 lg:block">Debt App</p>
      <ul className="mx-auto grid max-w-md grid-cols-6 lg:max-w-none lg:grid-cols-1 lg:gap-1 lg:px-3">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block py-3 text-center text-xs sm:text-sm lg:rounded-lg lg:px-3 lg:py-2 lg:text-left ${
                  isActive ? 'font-semibold text-green-900 lg:bg-green-50' : 'text-slate-500 lg:hover:bg-slate-50'
                }`
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
