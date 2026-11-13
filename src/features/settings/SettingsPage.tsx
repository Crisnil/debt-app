import { useState } from 'react'
import { isGoogleConfigured } from '../../config'
import { SchemaError } from '../../data/workbook'
import { useSession, useWorkbook } from '../../state/hooks'
import { Button } from '../../ui/Button'
import { ErrorNote } from '../../ui/ErrorNote'
import { Field, TextInput } from '../../ui/form'
import { useAction } from '../../ui/useAction'
import { InstallCard, MoneySettings } from './MoneySettings'
import { SheetUpdateCard } from './SheetUpdateCard'

export function SettingsPage() {
  const { signedIn, sheet, signIn, signOut, chooseSheet, forgetSheet, createSheet } = useSession()
  const workbook = useWorkbook()
  const [link, setLink] = useState('')
  const [name, setName] = useState('')
  const createAction = useAction(createSheet)
  const signInAction = useAction(signIn)
  const pickAction = useAction(chooseSheet)

  if (!isGoogleConfigured) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <ErrorNote message="Google is not set up for this build. Add the Google IDs (see README)." />
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>

      {/* Wide screens: account and sheet left, money settings right. */}
      <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-6">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="font-medium text-slate-900">Google account</h2>
            <p className="mt-1 text-sm text-slate-600">{signedIn ? 'Signed in.' : 'Not signed in.'}</p>
            <div className="mt-3">
              {signedIn ? (
                <Button variant="secondary" onClick={signOut}>
                  Sign out
                </Button>
              ) : (
                <Button onClick={() => signInAction.run()} disabled={signInAction.busy}>
                  Sign in with Google
                </Button>
              )}
            </div>
            <ErrorNote message={signInAction.error} />
          </div>

          {!sheet && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <h2 className="font-medium text-green-900">New here? Create your sheet</h2>
              <p className="mt-1 text-sm text-slate-700">
                Sign in with Google and the app makes a new sheet in your Google Drive, ready to use. Your data stays in your Drive.
              </p>
              <div className="mt-3">
                <Field label="Your name (optional)" htmlFor="new-name">
                  <TextInput id="new-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ana" />
                </Field>
              </div>
              <Button className="mt-3 w-full" onClick={() => createAction.run(name.trim())} disabled={createAction.busy}>
                {createAction.busy ? 'Creating your sheet…' : 'Create my sheet'}
              </Button>
              <ErrorNote message={createAction.error} />
            </div>
          )}

          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="font-medium text-slate-900">{sheet ? 'Your sheet' : 'Already have a sheet?'}</h2>
            {sheet ? (
              <p className="mt-1 text-sm text-slate-600">
                Using <span className="font-medium text-slate-900">{sheet.name}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-600">No sheet selected.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => pickAction.run()} disabled={pickAction.busy}>
                {sheet ? 'Switch sheet' : 'Select sheet'}
              </Button>
              {sheet && (
                <Button variant="danger" onClick={forgetSheet}>
                  Forget sheet
                </Button>
              )}
            </div>
            <label className="mt-4 block text-sm text-slate-700" htmlFor="sheet-link">
              Or paste the sheet link
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="sheet-link"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="https://docs.google.com/spreadsheets/d/…"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
              <Button variant="secondary" disabled={!link || pickAction.busy} onClick={() => pickAction.run(link)}>
                Open
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Google asks you to confirm the sheet once. The app can open only sheets you select.</p>
            <ErrorNote message={pickAction.error} />
          </div>

          {sheet && signedIn && (
            <details className="rounded-xl bg-white p-4 shadow-sm" open={Boolean(workbook.error)}>
              <summary className="cursor-pointer font-medium text-slate-900">Advanced: sheet check</summary>
              {workbook.isPending && <p className="mt-1 text-sm text-slate-600">Reading the sheet…</p>}
              {workbook.error instanceof SchemaError && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800">
                  {workbook.error.problems.map((p) => (
                    <li key={p.message}>{p.message}</li>
                  ))}
                </ul>
              )}
              {workbook.error instanceof SchemaError && (
                <p className="mt-2 text-sm text-slate-600">
                  The sheet may use an older layout. Import the latest template file (File → Import → Replace spreadsheet), then reload.
                </p>
              )}
              {workbook.error && !(workbook.error instanceof SchemaError) && <ErrorNote message={workbook.error.message} />}
              {workbook.data && (
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  <li>✓ {workbook.data.cards.length} cards</li>
                  <li>✓ {workbook.data.lines.length} statement lines</li>
                  <li>✓ {workbook.data.snapshots.length} card updates</li>
                  <li>✓ {workbook.data.payments.length} payments</li>
                  <li>✓ {workbook.data.transactions.length} expenses</li>
                  <li>✓ {workbook.data.transfers.length} money moves</li>
                  <li>✓ {workbook.data.incomeLog.length} income entries</li>
                  <li>✓ {workbook.data.payables.length} bills</li>
                </ul>
              )}
            </details>
          )}
        </div>
        <div className="space-y-6">
          {sheet && signedIn && workbook.data && <SheetUpdateCard workbook={workbook.data} why="New features need these parts. Until then, those features stay off." />}
          {sheet && signedIn && workbook.data && <MoneySettings workbook={workbook.data} />}
          <InstallCard />
        </div>
      </div>
    </section>
  )
}
