import { useRef, useState, type ReactNode } from 'react'

/** Card in a Swipe row: one at a time on phones with the next one peeking, a grid cell on wide screens. */
export const swipeCard = 'relative flex w-[85%] shrink-0 snap-start flex-col rounded-2xl p-4 shadow-sm sm:w-72 lg:w-auto'

/**
 * A row of cards (li children). Phones: swipe through them, with dots below. Wide screens: a grid.
 * onActive: the card nearest the left edge after a swipe.
 */
export function Swipe({ label, count, active: given, onActive, children }: { label: string; count: number; active?: number; onActive?: (index: number) => void; children: ReactNode }) {
  const row = useRef<HTMLUListElement>(null)
  const [scrolled, setScrolled] = useState(0)
  const active = given ?? scrolled

  function onScroll() {
    const el = row.current
    if (!el || el.children.length === 0) return
    const items = [...el.children] as HTMLElement[]
    const left = el.scrollLeft + items[0].offsetLeft
    const nearest = items.reduce((best, item, i) => (Math.abs(item.offsetLeft - left) < Math.abs(items[best].offsetLeft - left) ? i : best), 0)
    setScrolled(nearest)
    onActive?.(nearest)
  }

  return (
    <div>
      <ul
        ref={row}
        onScroll={onScroll}
        aria-label={label}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 xl:grid-cols-4"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {children}
      </ul>
      {count > 1 && (
        <p className="mt-2 flex justify-center gap-1.5 lg:hidden" aria-hidden="true">
          {Array.from({ length: count }, (_, i) => (
            <span key={i} className={`h-1.5 rounded-full ${i === active ? 'w-4 bg-green-900' : 'w-1.5 bg-slate-300'}`} />
          ))}
        </p>
      )}
    </div>
  )
}
