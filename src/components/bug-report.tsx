import { cn } from 'cn'
import { LoaderCircle, Send } from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'
import { toast } from 'sonner'
import { MAX_REPORT_LENGTH, MIN_REPORT_LENGTH, type ReportContext, type ReportDevice } from '@shared/report'
import { Button } from '@/components/ui/button'
import { DrawerClose, DrawerContent, DrawerDescription, DrawerNested, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { ApiFailure, reportBug } from '@/lib/api'
import { isStandalone } from '@/lib/install'
import { useKeyboard } from '@/lib/keyboard'
import { useApp } from '@/lib/store'
import { useBackToClose } from '@/lib/ui'

const DEVICE_LABEL: Record<ReportDevice, string> = { ios: 'iPhone', android: 'Android', outro: 'tipo de aparelho' }

/** What goes with the text: enough to reproduce the bug, nothing about the student. */
function reportContext(): ReportContext {
  const agent = navigator.userAgent
  return {
    device: /iphone|ipad|ipod/i.test(agent) ? 'ios' : /android/i.test(agent) ? 'android' : 'outro',
    installed: isStandalone(),
    version: __APP_VERSION__,
    screen: window.location.pathname,
  }
}

/** "Relatar um bug", opened from the profile. The draft lives in the profile, so closing keeps it. */
export function BugReportSheet({
  trigger,
  draft,
  onDraftChange,
}: {
  trigger: ReactNode
  draft: string
  onDraftChange: (draft: string) => void
}) {
  const [open, setOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  // Closing through the button lets the profile below grow back (closing by state would not).
  const close = () => closeRef.current?.click()
  useBackToClose(open, close)
  // Same as the absence form: the sheet follows the iPhone keyboard itself (see absence-drawer).
  const keyboard = useKeyboard(open)
  const keyboardOpen = keyboard.visibleHeight > 0

  return (
    <DrawerNested open={open} onOpenChange={setOpen} repositionInputs={false}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent style={keyboardOpen ? { bottom: keyboard.inset, maxHeight: keyboard.visibleHeight - 12 } : undefined}>
        <BugReportForm draft={draft} onDraftChange={onDraftChange} keyboardOpen={keyboardOpen} onSent={close} />
        <DrawerClose ref={closeRef} hidden />
      </DrawerContent>
    </DrawerNested>
  )
}

function BugReportForm({
  draft,
  onDraftChange,
  keyboardOpen,
  onSent,
}: {
  draft: string
  onDraftChange: (draft: string) => void
  keyboardOpen: boolean
  onSent: () => void
}) {
  const token = useApp((state) => state.auth?.token)
  const [sending, setSending] = useState(false)
  const [writing, setWriting] = useState(false)
  const [device] = useState(() => reportContext().device)
  const compact = writing && keyboardOpen
  const ready = Boolean(token) && draft.trim().length >= MIN_REPORT_LENGTH && !sending

  async function send() {
    if (!token || !ready) return
    setSending(true)
    try {
      await reportBug(token, { description: draft.trim(), context: reportContext() })
      onDraftChange('')
      toast.success('Relato enviado', { description: 'Obrigado! Isso ajuda a deixar o app melhor.' })
      onSent()
    } catch (error) {
      toast.error(error instanceof ApiFailure ? error.message : 'Não consegui enviar agora. Tente de novo.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className={cn(
        'mx-auto min-h-0 w-full max-w-lg overflow-y-auto overscroll-contain px-5 pt-3',
        compact ? 'pb-4' : 'pb-[calc(env(safe-area-inset-bottom)+1.25rem)]',
      )}
    >
      <DrawerTitle className="text-xl font-semibold">Relatar um bug</DrawerTitle>
      <DrawerDescription className={cn('mt-0.5 leading-relaxed', compact && 'sr-only')}>
        Conte o que aconteceu. O relato é anônimo: seu nome, sua matrícula e seu login não vão junto.
      </DrawerDescription>
      <textarea
        aria-label="O que aconteceu"
        rows={5}
        maxLength={MAX_REPORT_LENGTH}
        value={draft}
        onFocus={() => setWriting(true)}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="Ex.: na aba Manual, toquei em Registrar falta e nada aconteceu."
        className={cn(
          'w-full resize-none rounded-2xl border border-input bg-transparent px-4 py-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          compact ? 'mt-3' : 'mt-4',
        )}
      />
      <p className="mt-1 flex justify-between gap-3 text-xs leading-relaxed text-muted-foreground">
        <span>Vai junto só: {DEVICE_LABEL[device]}, versão do app e a tela aberta.</span>
        <span className="tabular shrink-0">
          {draft.length}/{MAX_REPORT_LENGTH}
        </span>
      </p>
      <Button size="lg" className={cn('h-12 w-full rounded-2xl text-[15px]', compact ? 'mt-3' : 'mt-5')} disabled={!ready} onClick={() => void send()}>
        {sending ? <LoaderCircle className="animate-spin" /> : <Send />}
        {sending ? 'Enviando…' : 'Enviar relato'}
      </Button>
    </div>
  )
}
