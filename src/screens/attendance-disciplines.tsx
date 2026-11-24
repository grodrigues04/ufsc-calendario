import { cn } from 'cn'
import { motion } from 'motion/react'
import { AnimatedNumber } from '@/components/animated-number'
import { Ring } from '@/components/ring'
import { EASE_OUT, TONE_TEXT } from '@/components/tone'
import { formatDayCount, plural } from '@/lib/format'
import { absenceDays, type DisciplineView } from '@/lib/model'
import { useUi } from '@/lib/ui'

export function DisciplinesView({ views }: { views: DisciplineView[] }) {
  const openDiscipline = useUi((state) => state.openDiscipline)
  return (
    <div className="grid grid-cols-2 gap-3">
      {views.map((view, index) => {
        const { stats } = view
        const days = absenceDays(view)
        const delay = Math.min(index, 8) * 0.04
        return (
          <motion.button
            key={view.id}
            type="button"
            onClick={() => openDiscipline(view.id)}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: EASE_OUT, delay }}
            whileTap={{ scale: 0.97 }}
            className="flex flex-col items-center rounded-3xl border bg-card px-3 pt-4 pb-3.5 text-center"
          >
            <Ring percent={stats.percent} tone={stats.tone} size={88} stroke={8} delay={delay}>
              <AnimatedNumber value={stats.percent} className={cn('tabular text-xl font-semibold', TONE_TEXT[stats.tone])} />
            </Ring>
            <span className="mt-3 line-clamp-2 min-h-[2.5em] text-[13px] leading-tight font-semibold">{view.shortName}</span>
            <span className={cn('tabular mt-1 text-xs text-muted-foreground', stats.failed && 'font-medium text-bad')}>
              {stats.hasData ? `${stats.absences} de ${stats.allowedAbsences} aulas de falta` : 'sem chamadas'}
            </span>
            {stats.hasData && (
              <span className={cn('tabular text-xs text-muted-foreground', stats.failed && 'font-medium text-bad')}>
                {formatDayCount(days.absent)} de {plural(days.allowed, 'dia', 'dias')}
              </span>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}
