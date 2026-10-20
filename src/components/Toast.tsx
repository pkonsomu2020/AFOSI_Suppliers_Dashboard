import { useAppStore } from '../store/AppStore'
import { IconSparkle } from './icons'

export function Toast() {
  const { toast } = useAppStore()
  if (!toast) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="flex max-w-[calc(100vw-32px)] items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-pop">
        <IconSparkle className="shrink-0 text-orange" width={16} height={16} />
        <span>{toast}</span>
      </div>
    </div>
  )
}
