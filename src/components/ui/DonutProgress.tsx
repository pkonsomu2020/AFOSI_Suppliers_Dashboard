import { useInView } from '../../hooks/useInView'
import { useCountUp } from '../../hooks/useCountUp'

export function DonutProgress({
  percent,
  size = 148,
  stroke = 16,
  label,
  caption,
  trackColor = '#F5F5F5',
  color = '#F26522',
}: {
  percent: number
  size?: number
  stroke?: number
  label?: string
  caption?: string
  trackColor?: string
  color?: string
}) {
  const { ref, inView } = useInView()
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, percent))
  const dash = (clamped / 100) * c
  const animated = useCountUp(clamped, inView, 1100)

  return (
    <div ref={ref} className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={inView ? c - dash : c}
          style={{ transition: 'stroke-dashoffset 1100ms cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] font-extrabold leading-none">{label ?? `${Math.round(animated)}%`}</span>
        {caption ? <span className="mt-1 text-[11px] text-gray-500">{caption}</span> : null}
      </div>
    </div>
  )
}
