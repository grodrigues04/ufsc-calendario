import { CalendarX2, Users, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import { activeRecords } from '@shared/notes'
import { useInbox } from '@/lib/inbox'
import { shortDate } from '@/lib/news'
import { useNotes } from '@/lib/notes'
import { useApp } from '@/lib/store'
import { useUi } from '@/lib/ui'
import { EASE_OUT } from './tone'

const MAX_CARDS = 4

/** News at the top of "Hoje": absences registered in Moodle and work sent by the student's group. */
export function NewsCards() {
  const items = useInbox((state) => state.items)
  const dismiss = useInbox((state) => state.dismiss)
  const notes = useNotes((state) => state.notes)
  const semester = useApp((state) => state.student?.semester || state.sync?.semester || '')
  const openAbsence = useUi((state) => state.openAbsence)
  // An absence already noted in the Manual tab needs no card.
  const visible = useMemo(
    () =>
      items
        .filter(
          (item) =>
            item.kind !== 'absence' || !activeRecords(notes, semester, item.disciplineId).some((record) => record.date === item.date),
        )
        .slice(0, MAX_CARDS),
    [items, notes, semester],
  )

  return (
    <AnimatePresence initial={false}>
      {visible.map((item) => (
        <motion.article
          key={item.key}
          layout
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
          className="mb-3 flex gap-3 rounded-3xl border bg-card py-3.5 pr-2 pl-4"
        >
          <span
            className={
              item.kind === 'absence'
                ? 'grid size-9 shrink-0 place-items-center rounded-full bg-bad/12 text-bad'
                : 'grid size-9 shrink-0 place-items-center rounded-full bg-secondary'
            }
          >
            {item.kind === 'absence' ? <CalendarX2 className="size-4" /> : <Users className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{item.kind === 'absence' ? 'Falta lançada no Moodle' : 'Seu grupo enviou um trabalho'}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {item.kind === 'absence'
                ? `${shortDate(item.date)} · ${item.disciplineName}`
                : `${item.name}${item.disciplineName ? ` · ${item.disciplineName}` : ''}`}
            </p>
            {item.kind === 'absence' ? (
              <button
                type="button"
                onClick={() => openAbsence(item.disciplineId, undefined, item.date)}
                className="mt-2 text-[13px] font-semibold"
              >
                Adicionar às faltas manuais
              </button>
            ) : (
              <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[13px] font-semibold">
                Ver no Moodle
              </a>
            )}
          </div>
          <button
            type="button"
            aria-label="Dispensar"
            onClick={() => dismiss(item.key)}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground active:bg-secondary"
          >
            <X className="size-4" />
          </button>
        </motion.article>
      ))}
    </AnimatePresence>
  )
}
