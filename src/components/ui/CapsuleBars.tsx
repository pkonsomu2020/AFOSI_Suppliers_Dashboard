import { useInView } from '../../hooks/useInView'

export interface CapsuleBarDatum {
  label: string
  value: number
  title?: string
}

export function CapsuleBars({ data, max, highlightIndex }: { data: CapsuleBarDatum[]; max?: number; highlightIndex?: number }) {
  const { ref, inView } = useInView()
  const m = max ?? Math.max(...data.map((d) => d.value), 1)
  return (
    <div ref={ref} className="flex items-end gap-1.5 overflow-hidden pt-8 sm:gap-2.5">
      {data.map((d, i) => {
        const pct = Math.max(0.08, d.value / m)
        const isHi = highlightIndex === i
        return (
          <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="relative flex h-32 w-full items-end">
              <span
                className={`absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold transition-opacity duration-500 ${
                  isHi ? 'rounded-full bg-ink px-2 py-0.5 text-white' : 'text-gray-400'
                }`}
                style={{ opacity: inView ? 1 : 0, transitionDelay: `${i * 55 + 300}ms` }}
              >
                {d.value}
              </span>
              <div
                className={`w-full rounded-full transition-[height] duration-700 ease-out ${isHi ? 'bg-orange' : 'bg-gray-200'}`}
                style={{ height: inView ? `${pct * 100}%` : '0%', transitionDelay: `${i * 55}ms` }}
              />
            </div>
            <span className="w-full truncate text-center text-[11px] font-semibold text-gray-500" title={d.title ?? d.label}>
              {d.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
