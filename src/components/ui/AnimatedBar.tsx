import { useInView } from '../../hooks/useInView'

export function AnimatedBar({
  pct,
  color = '#F26522',
  trackClassName = 'bg-white/10',
  delay = 0,
}: {
  pct: number
  color?: string
  trackClassName?: string
  delay?: number
}) {
  const { ref, inView } = useInView()
  return (
    <div ref={ref} className={`h-2 overflow-hidden rounded-full ${trackClassName}`}>
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: inView ? `${pct}%` : '0%', background: color, transitionDelay: `${delay}ms` }}
      />
    </div>
  )
}
