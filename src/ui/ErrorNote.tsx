export function ErrorNote({ message }: { message: string | null | undefined }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
      {message}
    </p>
  )
}
