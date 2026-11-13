import { createContext } from 'react'
import type { PickedSheet } from '../google/picker'

export type Session = {
  signedIn: boolean
  sheet: PickedSheet | null
  signIn: () => Promise<void>
  signOut: () => void
  chooseSheet: (urlOrId?: string) => Promise<void>
  forgetSheet: () => void
  /** Signs in, creates a new sheet with every tab the app needs, and uses it. */
  createSheet: (name: string) => Promise<void>
}

export const SessionContext = createContext<Session | null>(null)

export const SHEET_KEY = 'debt-app.sheet'
