// Chrome fires beforeinstallprompt once, early. Keep it so a button can show the install dialog later.
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function listenForInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const canInstall = () => deferred !== null

export const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches ?? false

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const event = deferred
  deferred = null
  notify()
  await event.prompt()
  return (await event.userChoice).outcome === 'accepted'
}
