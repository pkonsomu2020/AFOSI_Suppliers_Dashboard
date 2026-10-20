import type { CSSProperties, ReactNode } from 'react'
import { useInView } from '../../hooks/useInView'

export function Reveal({
  children,
  delay = 0,
  className = '',
  y = 18,
  style,
}: {
  children: ReactNode
  delay?: number
  className?: string
  y?: number
  style?: CSSProperties
}) {
  const { ref, inView } = useInView()
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : `translateY(${y}px)`,
        transition: 'opacity 700ms cubic-bezier(0.16,1,0.3,1), transform 700ms cubic-bezier(0.16,1,0.3,1)',
        transitionDelay: `${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
