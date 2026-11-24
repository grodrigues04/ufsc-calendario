import { motion, useScroll, useTransform } from 'motion/react'
import type { ReactNode } from 'react'
import { syncNow } from '@/lib/sync'
import { ProfileButton } from './profile-button'
import { PullToRefresh } from './pull-to-refresh'

interface ScreenProps {
  title: string
  subtitle?: string
  children: ReactNode
}

/** Large title that collapses into a compact blurred bar while scrolling (iOS-like). */
export function Screen({ title, subtitle, children }: ScreenProps) {
  const { scrollY } = useScroll()
  const compactOpacity = useTransform(scrollY, [36, 64], [0, 1])

  return (
    <>
      <motion.div
        aria-hidden
        style={{ opacity: compactOpacity }}
        className="pointer-events-none fixed inset-x-0 top-0 z-30 border-b bg-background/80 pt-safe backdrop-blur-xl"
      >
        <div className="mx-auto flex h-11 max-w-lg items-center justify-center text-[15px] font-semibold">{title}</div>
      </motion.div>
      <PullToRefresh onRefresh={() => syncNow()}>
        <div className="mx-auto w-full max-w-lg px-4 pt-safe pb-[calc(env(safe-area-inset-bottom)+6.5rem)]">
          <header className="flex items-end justify-between gap-3 pt-5 pb-5">
            <div className="min-w-0">
              {subtitle && <p className="truncate text-[13px] font-medium text-muted-foreground first-letter:uppercase">{subtitle}</p>}
              <h1 className="text-[32px] leading-tight font-semibold tracking-tight">{title}</h1>
            </div>
            <ProfileButton />
          </header>
          {children}
        </div>
      </PullToRefresh>
    </>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-7 mb-2.5 flex items-baseline justify-between px-1">
      <h2 className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">{children}</h2>
      {action}
    </div>
  )
}
