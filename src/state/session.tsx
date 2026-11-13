import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { currentToken, signIn as googleSignIn, signOut as googleSignOut } from '../google/auth'
import { templateTabs } from '../data/template'
import { todayIso } from '../domain/dues'
import { pickSheet, sheetIdFromUrl, type PickedSheet } from '../google/picker'
import { createSpreadsheet } from '../google/sheetsApi'
import { SessionContext, SHEET_KEY } from './sessionContext'

function readStoredSheet(): PickedSheet | null {
  try {
    const raw = localStorage.getItem(SHEET_KEY)
    return raw ? (JSON.parse(raw) as PickedSheet) : null
  } catch {
    return null
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [signedIn, setSignedIn] = useState(() => currentToken() !== null)
  const [sheet, setSheet] = useState<PickedSheet | null>(readStoredSheet)

  const signIn = useCallback(async () => {
    await googleSignIn()
    setSignedIn(true)
    await queryClient.invalidateQueries({ queryKey: ['workbook'] })
  }, [queryClient])

  const signOut = useCallback(() => {
    googleSignOut()
    setSignedIn(false)
    queryClient.clear()
  }, [queryClient])

  const chooseSheet = useCallback(
    async (urlOrId?: string) => {
      const fileId = urlOrId ? sheetIdFromUrl(urlOrId) : null
      if (urlOrId && !fileId) throw new Error('That is not a Google Sheets link.')
      const token = await googleSignIn()
      setSignedIn(true)
      const picked = await pickSheet(token, fileId ?? undefined)
      if (!picked) return
      localStorage.setItem(SHEET_KEY, JSON.stringify(picked))
      setSheet(picked)
      await queryClient.invalidateQueries({ queryKey: ['workbook'] })
    },
    [queryClient],
  )

  const createSheet = useCallback(
    async (name: string) => {
      const token = await googleSignIn()
      setSignedIn(true)
      const title = name ? `Debt App · ${name}` : 'Debt App'
      const id = await createSpreadsheet(title, templateTabs(name, todayIso(), new Date().toISOString()), token)
      const created: PickedSheet = { id, name: title }
      localStorage.setItem(SHEET_KEY, JSON.stringify(created))
      setSheet(created)
      await queryClient.invalidateQueries({ queryKey: ['workbook'] })
    },
    [queryClient],
  )

  const forgetSheet = useCallback(() => {
    localStorage.removeItem(SHEET_KEY)
    setSheet(null)
    queryClient.clear()
  }, [queryClient])

  const value = useMemo(
    () => ({ signedIn, sheet, signIn, signOut, chooseSheet, forgetSheet, createSheet }),
    [signedIn, sheet, signIn, signOut, chooseSheet, forgetSheet, createSheet],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
