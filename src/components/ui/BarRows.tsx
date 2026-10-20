import { useInView } from '../../hooks/useInView'

export interface BarRowDatum {
  label: string
  value: number
  emphasis?: boolean
}

export function BarRows({ data, max }: { data: BarRowDatum[]; max?: number }) {
  const { ref, inView } = useInView()
  const m = max ?? Math.max(...data.map((d) => d.value), 1)
  return (
    <div ref={ref} className="flex flex-col gap-2.5">
      {data.map((d, i) => (
        <div key={d.label} className="grid grid-cols-[minmax(0,120px)_1fr_32px] items-center gap-2.5 text-[13px]">
          <span className="truncate text-gray-600" title={d.label}>
            {d.label}
          </span>
          <div className="h-3 overflow-hidden rounded-full bg-gray-50">
            <div
              className={`h-full rounded-full transition-[width] duration-700 ease-out ${d.emphasis ? 'bg-orange' : 'bg-ink'}`}
              style={{ width: inView ? `${Math.max(4, (d.value / m) * 100)}%` : '0%', transitionDelay: `${i * 70}ms` }}
            />
          </div>
          <span className="text-right font-semibold">{d.value}</span>
        </div>
      ))}
    </div>
  )
}
