import { AnimatePresence, motion, type PanInfo } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useLocation } from 'wouter'
import { Screen } from '@/components/screen'
import { Segmented } from '@/components/segmented'
import { EASE_OUT } from '@/components/tone'
import { useDisciplines } from '@/lib/sync'
import { DisciplinesView } from './attendance-disciplines'
import { OverviewView } from './attendance-overview'
import { SimulatorView } from './attendance-simulator'

const SEGMENTS = [
  { value: 'geral', label: 'Visão geral' },
  { value: 'disciplinas', label: 'Disciplinas' },
  { value: 'simulador', label: 'Simulador' },
] as const

type Segment = (typeof SEGMENTS)[number]['value']

const variants = {
  enter: (direction: number) => ({ x: direction * 48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction * -48, opacity: 0 }),
}

const SWIPE_DISTANCE = 70

export function AttendanceScreen() {
  const [location, navigate] = useLocation()
  const views = useDisciplines()
  const requested = location.split('/')[2]
  const segment: Segment = SEGMENTS.some((item) => item.value === requested) ? (requested as Segment) : 'geral'
  const index = SEGMENTS.findIndex((item) => item.value === segment)
  const previousIndex = useRef(index)
  const direction = index >= previousIndex.current ? 1 : -1
  useEffect(() => {
    previousIndex.current = index
  }, [index])

  const go = (value: Segment) => navigate(value === 'geral' ? '/presenca' : `/presenca/${value}`, { replace: true })

  // Swipe between "Visão geral" and "Disciplinas"; the simulator has its own horizontal controls.
  const onDragEnd = (_: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const swipe = info.offset.x + info.velocity.x * 0.15
    if (swipe < -SWIPE_DISTANCE && index < SEGMENTS.length - 1) go(SEGMENTS[index + 1].value)
    else if (swipe > SWIPE_DISTANCE && index > 0) go(SEGMENTS[index - 1].value)
  }

  return (
    <Screen title="Presença" subtitle="Mínimo de 75% para aprovação">
      <Segmented value={segment} options={[...SEGMENTS]} onChange={go} layoutId="attendance-segment" className="mb-4" />
      <div className="relative">
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={segment}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.28, ease: EASE_OUT }}
            drag={segment === 'simulador' ? false : 'x'}
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            dragSnapToOrigin
            onDragEnd={onDragEnd}
          >
            {segment === 'geral' && <OverviewView views={views} />}
            {segment === 'disciplinas' && <DisciplinesView views={views} />}
            {segment === 'simulador' && <SimulatorView views={views} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </Screen>
  )
}
