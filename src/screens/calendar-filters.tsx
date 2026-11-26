import { cn } from 'cn'
import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Slider } from 'radix-ui'
import { useState } from 'react'
import { hueColor } from '@/components/calendar-style'
import { EASE_OUT, SPRING_UI, TONE_BG, TONE_TEXT } from '@/components/tone'
import { inPercentRange, isFullRange, type PercentRange, RANGE_PRESETS, rangeLabel, rangeShortLabel, sameRange } from '@/lib/calendar'
import { formatPercent, plural } from '@/lib/format'
import type { DisciplineView } from '@/lib/model'

interface CalendarFiltersProps {
  views: DisciplineView[]
  showDone: boolean
  range: PercentRange
  onShowDone: (showDone: boolean) => void
  onRange: (range: PercentRange) => void
}

/** Two quiet controls above the calendar; the attendance range opens a small panel. */
export function CalendarFilters({ views, showDone, range, onShowDone, onRange }: CalendarFiltersProps) {
  const [open, setOpen] = useState(false)
  const narrowed = !isFullRange(range)

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={showDone}
          onClick={() => onShowDone(!showDone)}
          className="flex h-8 shrink-0 items-center gap-2 pl-1 text-[13px] font-medium text-muted-foreground"
        >
          <span
            className={cn(
              'grid size-[18px] place-items-center rounded-[6px] border-[1.5px] transition-colors',
              showDone ? 'border-foreground bg-foreground text-background' : 'border-muted-foreground/45 bg-card',
            )}
          >
            <AnimatePresence initial={false}>
              {showDone && (
                <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={SPRING_UI}>
                  <Check className="size-3" strokeWidth={3.2} />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          Mostrar entregues
        </button>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="calendar-frequency"
          aria-label={`Frequência: ${rangeLabel(range)}`}
          onClick={() => setOpen(!open)}
          className={cn(
            'flex h-8 min-w-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium transition-colors',
            narrowed ? 'bg-secondary text-foreground' : 'text-muted-foreground active:bg-secondary',
          )}
        >
          <SlidersHorizontal aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">Frequência: {rangeShortLabel(range)}</span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={SPRING_UI} className="shrink-0">
            <ChevronDown aria-hidden className="size-3.5" />
          </motion.span>
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="calendar-frequency"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <FrequencyPanel views={views} range={range} onRange={onRange} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Closer than this, the two values above the thumbs become one.
const JOINED_LABEL = 16

function FrequencyPanel({ views, range, onRange }: { views: DisciplineView[]; range: PercentRange; onRange: (range: PercentRange) => void }) {
  const matching = views.filter((view) => inPercentRange(view.stats.percent, range)).length
  const withoutRollCalls = views.some((view) => view.stats.percent === null)
  const joined = range[1] - range[0] < JOINED_LABEL

  return (
    <section data-no-pull className="mt-2 rounded-3xl border bg-card p-4" aria-label="Filtrar aulas por frequência">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">Aulas por frequência</h2>
        {views.length > 0 && (
          <p className="tabular shrink-0 text-xs text-muted-foreground">
            {matching} de {plural(views.length, 'disciplina', 'disciplinas')}
          </p>
        )}
      </div>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
        O calendário mostra só as aulas das disciplinas com a presença do Moodle nesta faixa.
      </p>

      <Slider.Root
        value={range}
        min={0}
        max={100}
        step={1}
        onValueChange={(value) => onRange([value[0], value[1]])}
        className="relative mt-5 flex h-6 w-full touch-none items-center select-none"
      >
        {/* Inset by half a thumb, so 75% and 85% on the track sit under the thumbs at those values. */}
        <Slider.Track className="relative mx-3 h-2 grow overflow-hidden rounded-full">
          <span className="absolute inset-y-0 left-0 w-[75%] bg-bad" />
          <span className="absolute inset-y-0 left-[75%] w-[10%] bg-warn" />
          <span className="absolute inset-y-0 right-0 left-[85%] bg-good" />
          <span className="absolute inset-y-0 left-0 bg-card/80" style={{ width: `${range[0]}%` }} />
          <span className="absolute inset-y-0 right-0 bg-card/80" style={{ width: `${100 - range[1]}%` }} />
          <Slider.Range className="absolute h-full" />
        </Slider.Track>
        {(['Frequência mínima', 'Frequência máxima'] as const).map((label, index) => (
          <Slider.Thumb
            key={label}
            aria-label={label}
            className="relative grid size-6 place-items-center rounded-full border bg-card shadow-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {!joined && <span className="tabular pointer-events-none absolute -top-5 text-[11px] font-semibold">{range[index]}%</span>}
          </Slider.Thumb>
        ))}
        {joined && (
          <span
            aria-hidden
            className="tabular pointer-events-none absolute -top-5 -translate-x-1/2 text-[11px] font-semibold whitespace-nowrap"
            style={{ left: `calc(12px + (100% - 24px) * ${(range[0] + range[1]) / 200})` }}
          >
            {range[0] === range[1] ? `${range[0]}%` : `${range[0]}–${range[1]}%`}
          </span>
        )}
      </Slider.Root>
      <div aria-hidden className="tabular relative mx-3 mt-1 h-3 text-[10px] text-muted-foreground">
        <span className="absolute left-0 -translate-x-1/2">0</span>
        <span className="absolute left-[75%] -translate-x-1/2">75</span>
        <span className="absolute left-[85%] -translate-x-1/2">85</span>
        <span className="absolute left-full -translate-x-1/2">100</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {RANGE_PRESETS.map((preset) => {
          const active = sameRange(preset.range, range)
          return (
            <motion.button
              key={preset.label}
              type="button"
              whileTap={{ scale: 0.94 }}
              transition={SPRING_UI}
              aria-pressed={active}
              onClick={() => onRange(preset.range)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
                active ? 'border-foreground bg-foreground text-background' : 'bg-card',
              )}
            >
              {preset.tone && <span className={cn('size-2 rounded-full', TONE_BG[preset.tone])} />}
              {preset.label}
            </motion.button>
          )
        })}
      </div>

      {views.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5 border-t pt-3" aria-label="Disciplinas">
          {views.map((view) => {
            const shown = inPercentRange(view.stats.percent, range)
            return (
              <li
                key={view.id}
                className={cn(
                  'flex h-7 max-w-full items-center gap-1.5 rounded-full bg-secondary/70 px-2.5 text-xs transition-opacity',
                  !shown && 'opacity-40',
                )}
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: hueColor(view.hue) }} />
                <span className={cn('truncate font-medium', !shown && 'line-through')}>{view.shortName}</span>
                <span className={cn('tabular shrink-0 font-semibold', TONE_TEXT[view.stats.tone])}>{formatPercent(view.stats.percent)}</span>
              </li>
            )
          })}
        </ul>
      )}
      {withoutRollCalls && !isFullRange(range) && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Disciplinas sem chamada no Moodle só aparecem com a faixa completa.</p>
      )}
    </section>
  )
}
