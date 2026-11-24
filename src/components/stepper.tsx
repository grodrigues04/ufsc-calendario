import { cn } from 'cn'
import { Minus, Plus } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef } from 'react'
import { SPRING_UI } from './tone'

interface StepperProps {
  value: number
  min?: number
  max: number
  onChange: (value: number) => void
  unit: [singular: string, plural: string]
  size?: 'sm' | 'md'
}

export function Stepper({ value, min = 0, max, onChange, unit, size = 'md' }: StepperProps) {
  const previous = useRef(value)
  const direction = value >= previous.current ? 1 : -1
  previous.current = value
  const button = cn(
    'grid place-items-center rounded-full bg-secondary text-foreground disabled:opacity-35',
    size === 'md' ? 'size-11' : 'size-9',
  )
  return (
    <div className="flex items-center gap-3">
      <motion.button
        type="button"
        aria-label="Menos uma falta"
        className={button}
        whileTap={{ scale: 0.86 }}
        transition={SPRING_UI}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="size-4" />
      </motion.button>
      <div className={cn('relative overflow-hidden text-center', size === 'md' ? 'w-20' : 'w-14')}>
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.span
            key={value}
            custom={direction}
            initial={{ y: direction * 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: direction * -14, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            className={cn('tabular block font-semibold leading-none', size === 'md' ? 'text-3xl' : 'text-xl')}
          >
            {value}
          </motion.span>
        </AnimatePresence>
        <span className="mt-1 block text-[11px] text-muted-foreground">{value === 1 ? unit[0] : unit[1]}</span>
      </div>
      <motion.button
        type="button"
        aria-label="Mais uma falta"
        className={button}
        whileTap={{ scale: 0.86 }}
        transition={SPRING_UI}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus className="size-4" />
      </motion.button>
    </div>
  )
}
