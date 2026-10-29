import { createContext } from 'react'
import type { PickedSheet } from '../google/picker'

export type Session = {
  signedIn: boolean
  sheet: PickedSheet | null
  signIn: () => Promise<void>
  signOut: () => void
  chooseSheet: (urlOrId?: string) => Promise<void>
  forgetSheet: () => void
}

export const SessionContext = createContext<Session | null>(null)

export const SHEET_KEY = 'debt-app.sheet'
