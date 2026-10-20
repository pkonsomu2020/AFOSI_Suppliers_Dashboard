import type { ReactNode } from 'react'
import { useAppStore } from '../store/AppStore'
import { IconAlert } from './icons'

export function DataGate({ children }: { children: ReactNode }) {
  const { loading, loadError } = useAppStore()

  if (loadError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-bad/40 bg-white p-10 text-center">
        <IconAlert width={28} height={28} className="text-bad" />
        <span className="text-[17px] font-bold">Couldn't reach Supabase</span>
        <span className="max-w-md text-[14px] text-gray-500">
          {loadError}. Make sure <code className="rounded bg-gray-50 px-1.5 py-0.5">supabase/schema.sql</code> has been run in your
          project and the keys in <code className="rounded bg-gray-50 px-1.5 py-0.5">.env</code> are correct.
        </span>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-orange" />
        <span className="text-[14px] text-gray-500">Loading suppliers…</span>
      </div>
    )
  }

  return <>{children}</>
}
