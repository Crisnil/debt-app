import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Workbook } from '../domain/types'
import { useLiveWorkbook, useSession } from '../state/hooks'

/** Shows the page body when the sheet is loaded, else a short sign-in or loading note. */
export function WithWorkbook({ title, children }: { title: string; children: (sheetId: string, workbook: Workbook) => ReactNode }) {
  const { sheet, signedIn } = useSession()
  const { workbook, query } = useLiveWorkbook()

  if (!sheet || !workbook) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {query.error ? (
          <p className="mt-2 text-red-800">{query.error.message}</p>
        ) : signedIn && sheet ? (
          <p className="mt-2 text-slate-600">Reading your sheet…</p>
        ) : (
          <p className="mt-2 text-slate-600">
            Sign in and select your sheet in{' '}
            <Link to="/settings" className="text-green-900 underline">
              Settings
            </Link>{' '}
            first.
          </p>
        )}
      </section>
    )
  }
  return <>{children(sheet.id, workbook)}</>
}
