import type { ReactNode } from 'react'
import { IconArrowUpRight } from '../icons'
import { useInView } from '../../hooks/useInView'
import { useCountUp } from '../../hooks/useCountUp'

type Tone = 'light' | 'orange' | 'ink'

const TONE_STYLES: Record<Tone, { card: string; iconBtn: string; caption: string }> = {
  light: { card: 'bg-white border border-gray-200', iconBtn: 'bg-gray-50 text-ink', caption: 'text-gray-600' },
  orange: { card: 'bg-orange border border-orange', iconBtn: 'bg-black/10 text-ink', caption: 'text-ink/80' },
  ink: { card: 'bg-ink border border-ink text-white', iconBtn: 'bg-white/10 text-white', caption: 'text-white/70' },
}

export function StatCard({
  label,
  value,
  caption,
  tone = 'light',
  onClick,
  delay = 0,
}: {
  label: string
  value: number
  caption?: ReactNode
  tone?: Tone
  onClick?: () => void
  delay?: number
}) {
  const t = TONE_STYLES[tone]
  const { ref, inView } = useInView()
  const animated = useCountUp(value, inView)

  return (
    <div
      ref={ref}
      className={`flex flex-col gap-5 rounded-3xl p-5 shadow-card ${t.card}`}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(16px)',
        transition: 'opacity 650ms cubic-bezier(0.16,1,0.3,1), transform 650ms cubic-bezier(0.16,1,0.3,1)',
        transitionDelay: `${delay}ms`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium">{label}</span>
        <button
          onClick={onClick}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform hover:-translate-y-0.5 hover:rotate-45 ${t.iconBtn}`}
          aria-label={label}
        >
          <IconArrowUpRight width={14} height={14} />
        </button>
      </div>
      <span className="text-4xl font-extrabold leading-none tracking-tight">{Math.round(animated)}</span>
      {caption ? <span className={`text-[13px] leading-snug ${t.caption}`}>{caption}</span> : null}
    </div>
  )
}
