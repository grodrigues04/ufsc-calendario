import { cn } from 'cn'
import { motion } from 'motion/react'
import { MIN_ATTENDANCE, type Tone } from '@/lib/model'
import { SPRING_DATA, TONE_BG } from './tone'

interface AttendanceBarProps {
  percent: number | null
  tone: Tone
  className?: string
  /** Shows the 75% line. */
  marker?: boolean
  delay?: number
  muted?: boolean
}

/**
 * The fill is a full-width rounded bar moved with translateX inside a clipped track:
 * only transforms animate (no layout), and the rounded end never gets distorted.
 */
export function AttendanceBar({ percent, tone, className, marker = true, delay = 0, muted = false }: AttendanceBarProps) {
  const value = Math.max(0, Math.min(100, percent ?? 0))
  return (
    <div
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-(--track)', className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
    >
      <motion.div
        className={cn('absolute inset-0 rounded-full', TONE_BG[tone], muted && 'opacity-45')}
        initial={{ x: '-100%' }}
        animate={{ x: `${value - 100}%` }}
        transition={{ ...SPRING_DATA, delay }}
      />
      {marker && (
        <span
          aria-hidden
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-background/85"
          style={{ left: `${MIN_ATTENDANCE}%` }}
        />
      )}
    </div>
  )
}
