import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'

export const Card = forwardRef<
  HTMLDivElement,
  {
    children: ReactNode
    className?: string
    tone?: 'light' | 'ink'
  } & HTMLAttributes<HTMLDivElement>
>(function Card({ children, className = '', tone = 'light', ...rest }, ref) {
  const toneClass = tone === 'ink' ? 'bg-ink text-white border border-ink' : 'bg-white border border-gray-200'
  return (
    <div ref={ref} className={`rounded-3xl p-5 shadow-card ${toneClass} ${className}`} {...rest}>
      {children}
    </div>
  )
})

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-[15px] font-bold leading-tight">{title}</span>
        {subtitle ? <span className="text-xs text-gray-500">{subtitle}</span> : null}
      </div>
      {action}
    </div>
  )
}
