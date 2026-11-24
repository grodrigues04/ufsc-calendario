import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect } from 'react'
import { formatPercent } from '@/lib/format'
import { SPRING_DATA } from './tone'

interface AnimatedNumberProps {
  value: number | null
  format?: (value: number) => string
  /** Counts up from zero on mount. */
  fromZero?: boolean
  className?: string
}

/** Tweens numbers outside React rendering (the text node is updated directly). */
export function AnimatedNumber({ value, format = (number) => formatPercent(number), fromZero = true, className }: AnimatedNumberProps) {
  const motionValue = useMotionValue(fromZero ? 0 : (value ?? 0))
  const text = useTransform(motionValue, (latest) => format(latest))

  useEffect(() => {
    if (value === null) return
    const controls = animate(motionValue, value, SPRING_DATA)
    return () => controls.stop()
  }, [motionValue, value])

  if (value === null) return <span className={className}>—</span>
  return <motion.span className={className}>{text}</motion.span>
}
