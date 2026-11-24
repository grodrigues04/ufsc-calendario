import { CalendarX2, Users, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useInbox } from '@/lib/inbox'
import { type NewsItem, shortDate } from '@/lib/news'
import { useUi } from '@/lib/ui'
import { EASE_OUT } from './tone'

/** News: absences registered in Moodle and work sent by the student's group. */
export function NewsList({ items }: { items: NewsItem[] }) {
  const dismiss = useInbox((state) => state.dismiss)
  const openAbsence = useUi((state) => state.openAbsence)

  return (
    <AnimatePresence initial={false}>
      {items.map((item, index) => (
        <motion.article
          key={item.key}
          layout
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_OUT, delay: 0.06 + Math.min(index, 6) * 0.05 } }}
          exit={{ opacity: 0, x: 40, transition: { duration: 0.22 } }}
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
