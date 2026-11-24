import { cn } from 'cn'
import { motion } from 'motion/react'
import { SPRING_UI } from './tone'

interface SegmentedProps<T extends string> {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  layoutId: string
  className?: string
}

export function Segmented<T extends string>({ value, options, onChange, layoutId, className }: SegmentedProps<T>) {
  return (
    <div role="tablist" className={cn('grid auto-cols-fr grid-flow-col rounded-xl bg-secondary p-1', className)}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative h-8 rounded-[10px] px-2 text-[13px] font-medium transition-colors',
              active ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-[10px] bg-card shadow-sm ring-1 ring-black/[0.04] dark:bg-white/12"
                transition={SPRING_UI}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
