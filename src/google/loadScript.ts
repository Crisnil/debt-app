const pending = new Map<string, Promise<void>>()

/** Loads an external script once. */
export function loadScript(src: string): Promise<void> {
  const existing = pending.get(src)
  if (existing) return existing
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      pending.delete(src)
      reject(new Error(`Could not load ${src}. Check the internet connection.`))
    }
    document.head.appendChild(script)
  })
  pending.set(src, promise)
  return promise
}
