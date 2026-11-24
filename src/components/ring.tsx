import { cn } from 'cn'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import type { Tone } from '@/lib/model'
import { SPRING_DATA, TONE_STROKE } from './tone'

interface RingProps {
  percent: number | null
  tone: Tone
  size?: number
  stroke?: number
  className?: string
  children?: ReactNode
  delay?: number
}

export function Ring({ percent, tone, size = 84, stroke = 8, className, children, delay = 0 }: RingProps) {
  const radius = (size - stroke) / 2
  const value = Math.max(0, Math.min(100, percent ?? 0)) / 100
  return (
    <div className={cn('relative grid shrink-0 place-items-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-(--track)" />
        {value > 0 && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            className={TONE_STROKE[tone]}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: value }}
            transition={{ ...SPRING_DATA, delay }}
          />
        )}
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  )
}
