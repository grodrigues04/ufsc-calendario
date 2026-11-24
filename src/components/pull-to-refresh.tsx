import { RefreshCw } from 'lucide-react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { type ReactNode, useEffect, useRef } from 'react'

const THRESHOLD = 72
const HOLD = 56
const MAX_PULL = 120

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: ReactNode
}

/**
 * Native-feeling pull-to-refresh for the standalone app. The non-passive touchmove listener
 * only exists while a pull starts at the top of the page, so normal scrolling stays passive.
 */
export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const pull = useMotionValue(0)
  const indicatorOpacity = useTransform(pull, [8, THRESHOLD], [0, 1])
  const indicatorScale = useTransform(pull, [0, THRESHOLD], [0.6, 1])
  const rotate = useTransform(pull, [0, MAX_PULL], [0, 300])
  const indicatorY = useTransform(pull, (value) => value * 0.5)
  const busy = useRef(false)
  const refresh = useRef(onRefresh)
  refresh.current = onRefresh

  useEffect(() => {
    let startY: number | null = null
    let active = false

    const onMove = (event: TouchEvent) => {
      if (startY === null) return
      const delta = event.touches[0].clientY - startY
      if (delta <= 0 || window.scrollY > 0) {
        if (active) pull.set(0)
        active = false
        return
      }
      active = true
      pull.set(Math.min(MAX_PULL, delta * 0.5))
      if (event.cancelable) event.preventDefault()
    }

    const onEnd = () => {
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
      const reached = active && pull.get() >= THRESHOLD
      startY = null
      active = false
      if (!reached) {
        animate(pull, 0, { type: 'spring', bounce: 0, duration: 0.35 })
        return
      }
      busy.current = true
      navigator.vibrate?.(8)
      animate(pull, HOLD, { type: 'spring', bounce: 0, duration: 0.3 })
      void refresh.current().finally(() => {
        busy.current = false
        animate(pull, 0, { type: 'spring', bounce: 0, duration: 0.45 })
      })
    }

    const onStart = (event: TouchEvent) => {
      const target = event.target as Element | null
      if (busy.current || window.scrollY > 0 || target?.closest('[data-vaul-drawer], [role="dialog"], [data-no-pull]')) return
      startY = event.touches[0].clientY
      window.addEventListener('touchmove', onMove, { passive: false })
      window.addEventListener('touchend', onEnd)
      window.addEventListener('touchcancel', onEnd)
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [pull])

  return (
    <>
      <motion.div
        aria-hidden
        style={{ opacity: indicatorOpacity, scale: indicatorScale, y: indicatorY }}
        className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+10px)] z-20 flex justify-center"
      >
        <span className="grid size-9 place-items-center rounded-full border bg-card shadow-sm">
          <motion.span style={{ rotate }} className="grid place-items-center">
            <RefreshCw className="size-4 text-muted-foreground" />
          </motion.span>
        </span>
      </motion.div>
      <motion.div style={{ y: pull }}>{children}</motion.div>
    </>
  )
}
