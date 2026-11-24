import { Download, LogOut, RefreshCw, Share } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { formatSyncedAgo } from '@/lib/format'
import { useInstallPrompt } from '@/lib/install'
import { clearNotes, flushNotes } from '@/lib/notes'
import { useApp, useClock } from '@/lib/store'
import { syncNow } from '@/lib/sync'
import { useBackToClose, useUi } from '@/lib/ui'
import { initials } from './profile-button'

function formatSemester(semester: string | undefined | null): string {
  return semester && semester.length === 5 ? `${semester.slice(0, 4)}.${semester.slice(4)}` : '—'
}

export function ProfileDrawer() {
  const open = useUi((state) => state.profileOpen)
  const setOpen = useUi((state) => state.setProfileOpen)
  const student = useApp((state) => state.student)
  const syncedAt = useApp((state) => state.sync?.syncedAt)
  const semester = useApp((state) => state.sync?.semester)
  const syncing = useApp((state) => state.syncing)
  const signOut = useApp((state) => state.signOut)
  const now = useClock((state) => state.now)
  const { canInstall, showIosHint, install } = useInstallPrompt()
  useBackToClose(open, () => setOpen(false))

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-lg px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-secondary text-base font-semibold">
              {initials(student?.name)}
            </span>
            <div className="min-w-0">
              <DrawerTitle className="truncate text-lg font-semibold">{student?.name || 'Estudante UFSC'}</DrawerTitle>
              <DrawerDescription className="truncate">{student?.program || 'Moodle UFSC'}</DrawerDescription>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-secondary/70 px-4 py-3">
              <dt className="text-xs text-muted-foreground">Matrícula</dt>
              <dd className="tabular mt-0.5 font-semibold">{student?.registration || '—'}</dd>
            </div>
            <div className="rounded-2xl bg-secondary/70 px-4 py-3">
              <dt className="text-xs text-muted-foreground">Semestre</dt>
              <dd className="tabular mt-0.5 font-semibold">{formatSemester(student?.semester || semester)}</dd>
            </div>
          </dl>

          <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-secondary/70 px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">Última atualização</p>
              <p className="font-semibold">{syncing ? 'Atualizando…' : formatSyncedAgo(syncedAt, now)}</p>
            </div>
            <Button variant="outline" size="lg" className="rounded-full" disabled={syncing} onClick={() => void syncNow()}>
              <RefreshCw className={syncing ? 'animate-spin' : undefined} />
              Atualizar
            </Button>
          </div>

          {canInstall && (
            <Button size="lg" className="mt-4 h-11 w-full rounded-full" onClick={() => void install()}>
              <Download />
              Instalar o app
            </Button>
          )}
          {showIosHint && (
            <p className="mt-4 flex items-start gap-2 rounded-2xl border px-4 py-3 text-[13px] text-muted-foreground">
              <Share className="mt-0.5 size-4 shrink-0" />
              Para instalar no iPhone, toque em Compartilhar e depois em “Adicionar à Tela de Início”.
            </p>
          )}

          <Button
            variant="destructive"
            size="lg"
            className="mt-4 h-11 w-full rounded-full"
            onClick={async () => {
              setOpen(false)
              await flushNotes()
              clearNotes()
              signOut()
              toast('Você saiu', { description: 'Os dados foram apagados deste aparelho. Suas faltas anotadas continuam salvas na sua conta.' })
            }}
          >
            <LogOut />
            Sair
          </Button>
          <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
            App não oficial. Sua senha nunca é guardada. Os dados do Moodle ficam neste aparelho; as faltas anotadas ficam criptografadas na nuvem.
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
