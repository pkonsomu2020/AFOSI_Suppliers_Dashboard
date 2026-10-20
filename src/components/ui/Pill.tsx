import type { ReactNode } from 'react'

type Tone = 'neutral' | 'orange' | 'ink' | 'good' | 'bad' | 'outline'

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-gray-50 text-ink border border-gray-50',
  orange: 'bg-orange text-ink border border-orange',
  ink: 'bg-ink text-white border border-ink',
  good: 'bg-white text-good border border-good',
  bad: 'bg-white text-bad border border-bad',
  outline: 'bg-white text-ink border border-gray-200',
}

export function Pill({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function Chip({
  children,
  active,
  onClick,
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
        active ? 'border-orange bg-orange font-semibold text-ink' : 'border-gray-200 bg-white text-ink hover:border-orange'
      }`}
    >
      {children}
    </button>
  )
}
