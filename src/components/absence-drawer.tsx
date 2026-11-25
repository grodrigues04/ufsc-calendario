import { cn } from 'cn'
import { Check, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { activeRecords, MAX_NOTE_LENGTH } from '@shared/notes'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { dayDiff, formatDayMonth, plural, weekdayShort } from '@/lib/format'
import { useKeyboard } from '@/lib/keyboard'
import { classesOnDate, type DisciplineView, isoDay, recentClassDays } from '@/lib/model'
import { useNotes } from '@/lib/notes'
import { useClock, useSemester } from '@/lib/store'
import { useDisciplines } from '@/lib/sync'
import { type AbsenceSheet, useBackToClose, useUi } from '@/lib/ui'
import { EASE_OUT, SPRING_UI } from './tone'

/** Registers a manual absence (one class day) or edits one, with an optional note. */
export function AbsenceDrawer() {
  const sheet = useUi((state) => state.absence)
  const close = useUi((state) => state.closeAbsence)
  const views = useDisciplines()
  const view = sheet ? (views.find((candidate) => candidate.id === sheet.disciplineId) ?? null) : null
  // Keep rendering the last form while the sheet animates out.
  const last = useRef<{ sheet: AbsenceSheet; view: DisciplineView } | null>(null)
  if (sheet && view) last.current = { sheet, view }
  const shown = last.current
  const open = Boolean(sheet && view)
  useBackToClose(Boolean(sheet), close)
  // The sheet follows the keyboard itself: Vaul's own repositioning ignores how far Safari already
  // scrolled to show the field (the sheet ended up at the top of the screen) and, in the installed
  // app, also scrolled the page behind it to the top.
  const keyboard = useKeyboard(open)
  const keyboardOpen = keyboard.visibleHeight > 0

  return (
    <Drawer open={open} onOpenChange={(value) => !value && close()} repositionInputs={false}>
      <DrawerContent style={keyboardOpen ? { bottom: keyboard.inset, maxHeight: keyboard.visibleHeight - 12 } : undefined}>
        {shown && (
          <AbsenceForm key={shown.sheet.openedAt} sheet={shown.sheet} view={shown.view} keyboardOpen={keyboardOpen} onDone={close} />
        )}
      </DrawerContent>
    </Drawer>
  )
}

function dayLabel(day: string, now: Date): string {
  const date = new Date(`${day}T12:00:00`)
  const diff = dayDiff(now, date)
  const relative = diff === 0 ? ' · hoje' : diff === -1 ? ' · ontem' : ''
  return `${weekdayShort(date)} ${formatDayMonth(date)}${relative}`
}

function AbsenceForm({
  sheet,
  view,
  keyboardOpen,
  onDone,
}: {
  sheet: AbsenceSheet
  view: DisciplineView
  keyboardOpen: boolean
  onDone: () => void
}) {
  const now = useClock((state) => state.now)
  const semester = useSemester()
  const notes = useNotes((state) => state.notes)
  const { addAbsence, updateAbsence, deleteAbsence } = useNotes.getState()
  const records = useMemo(() => activeRecords(notes, semester, view.id), [notes, semester, view.id])
  const editing = sheet.recordId ? (records.find((record) => record.id === sheet.recordId) ?? null) : null
  const days = useMemo(() => recentClassDays(view, now, 8), [view, now])
  const taken = new Set(records.filter((record) => record.id !== sheet.recordId).map((record) => record.date))

  const [date, setDate] = useState<string | null>(() =>
    editing ? editing.date : (sheet.presetDate ?? days.find((day) => !taken.has(day)) ?? days[0] ?? isoDay(now)),
  )
  const [note, setNote] = useState(editing?.note ?? '')
  const [otherDay, setOtherDay] = useState(() => Boolean(date && !days.includes(date)))
  // While the note is being typed the day picker folds away, so the sheet fits above the keyboard.
  // It only comes back once the keyboard is gone: folding it back on blur would move the
  // "Registrar falta" button away from under the finger.
  const [writing, setWriting] = useState(false)
  const compact = writing && keyboardOpen

  function submit() {
    if (!semester) return
    const input = { date, note }
    navigator.vibrate?.(10)
    if (editing) {
      updateAbsence(semester, view.id, editing.id, input)
      toast.success('Falta atualizada')
    } else {
      const id = addAbsence(semester, view.id, input)
      toast.success('Falta registrada', {
        description: view.name,
        action: { label: 'Desfazer', onClick: () => deleteAbsence(semester, view.id, id) },
      })
    }
    onDone()
  }

  function remove() {
    if (!editing || !semester) return
    deleteAbsence(semester, view.id, editing.id)
    toast('Falta apagada', { description: view.name })
    onDone()
  }

  return (
    <div
      className={cn(
        'mx-auto min-h-0 w-full max-w-lg overflow-y-auto overscroll-contain px-5 pt-3',
        // Above the keyboard the home indicator area is covered anyway.
        compact ? 'pb-4' : 'pb-[calc(env(safe-area-inset-bottom)+1.25rem)]',
      )}
    >
      <DrawerTitle className="text-xl font-semibold">{editing ? 'Editar falta' : 'Registrar falta'}</DrawerTitle>
      <DrawerDescription className="mt-0.5 truncate">
        {view.name}
        {compact && date && ` · ${dayLabel(date, now)}`}
      </DrawerDescription>

      <AnimatePresence initial={false}>
        {!compact && (
          <motion.div
            key="days"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            className="-mx-5 overflow-hidden px-5 pb-1"
          >
            <p className="mt-5 mb-2 text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">Qual aula?</p>
            <div data-no-pull className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
              {days.map((day) => {
                const selected = !otherDay && date === day
                const already = taken.has(day)
                return (
                  <motion.button
                    key={day}
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    transition={SPRING_UI}
                    onClick={() => {
                      setOtherDay(false)
                      setDate(day)
                    }}
                    className={cn(
                      'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition-colors',
                      selected ? 'border-foreground bg-foreground text-background' : 'bg-card',
                      already && !selected && 'text-muted-foreground',
                    )}
                  >
                    {already && <Check className="size-3.5" />}
                    {dayLabel(day, now)}
                  </motion.button>
                )
              })}
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                transition={SPRING_UI}
                onClick={() => setOtherDay(true)}
                className={cn(
                  'h-9 shrink-0 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap',
                  otherDay ? 'border-foreground bg-foreground text-background' : 'bg-card',
                )}
              >
                Outro dia
              </motion.button>
            </div>
            {otherDay && (
              <Input
                type="date"
                aria-label="Data da falta"
                max={isoDay(now)}
                value={date ?? ''}
                onChange={(event) => setDate(event.target.value || null)}
                className="mt-2 h-11 rounded-2xl text-base"
              />
            )}
            {date && taken.has(date) && <p className="mt-2 text-xs text-warn">Você já anotou uma falta nesse dia.</p>}
            {editing && !editing.date && !date && (
              <p className="mt-2 text-xs text-muted-foreground">Falta anotada sem data na versão anterior do app.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <label
        htmlFor="absence-note"
        className={cn('mt-5 mb-2 block text-[13px] font-semibold tracking-wide text-muted-foreground uppercase', compact && 'sr-only')}
      >
        Anotação <span className="font-medium normal-case">(opcional)</span>
      </label>
      <textarea
        id="absence-note"
        rows={2}
        maxLength={MAX_NOTE_LENGTH}
        value={note}
        onFocus={() => setWriting(true)}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Ex.: consulta médica, ônibus não passou…"
        className={cn(
          'w-full resize-none rounded-2xl border border-input bg-transparent px-4 py-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          compact && 'mt-3',
        )}
      />
      <p className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>Conta como {plural(classesOnDate(view, date), 'aula', 'aulas')}</span>
        <span className="tabular">
          {note.length}/{MAX_NOTE_LENGTH}
        </span>
      </p>

      <Button size="lg" className={cn('h-12 w-full rounded-2xl text-[15px]', compact ? 'mt-3' : 'mt-5')} disabled={!semester} onClick={submit}>
        {editing ? 'Salvar' : 'Registrar falta'}
      </Button>
      {editing && (
        <Button variant="ghost" size="lg" className="mt-2 h-11 w-full rounded-2xl text-bad hover:text-bad" onClick={remove}>
          <Trash2 />
          Apagar falta
        </Button>
      )}
    </div>
  )
}
