import { BellRing, CheckCheck } from 'lucide-react'
import { motion } from 'motion/react'
import { NewsList } from '@/components/news-cards'
import { Screen } from '@/components/screen'
import { EASE_OUT } from '@/components/tone'
import { plural } from '@/lib/format'
import { useVisibleNews } from '@/lib/inbox'
import { notifySupport, useBackgroundNews } from '@/lib/notify'

function explanation(support: ReturnType<typeof notifySupport>, enabled: boolean): { title: string; text: string } {
  if (support === 'in-app') {
    return {
      title: 'Seus avisos ficam aqui',
      text: 'O iPhone não deixa apps da web mandarem notificação com o app fechado. Por isso, quando o Chamada encontra uma falta lançada no Moodle ou um trabalho enviado pelo seu grupo, ele guarda o aviso nesta aba e mostra quantos são.',
    }
  }
  if (support === 'background' && enabled) {
    return {
      title: 'Também chegam como notificação',
      text: 'Estes avisos aparecem na barra de notificações do Android, mesmo com o app fechado. Aqui eles ficam reunidos até você ler.',
    }
  }
  return {
    title: 'Seus avisos ficam aqui',
    text:
      support === 'install-first'
        ? 'Faltas lançadas no Moodle e trabalhos enviados pelo seu grupo aparecem nesta aba. Instale o app para recebê-los também como notificação.'
        : 'Faltas lançadas no Moodle e trabalhos enviados pelo seu grupo aparecem nesta aba. No Android, dá para recebê-los também como notificação em Perfil → Avisos.',
  }
}

export function NewsScreen() {
  const items = useVisibleNews()
  const { support, enabled } = useBackgroundNews()
  const { title, text } = explanation(support, enabled)

  return (
    <Screen title="Avisos" subtitle={items.length ? plural(items.length, 'novidade', 'novidades') : 'Tudo lido'}>
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
        className="relative mb-4 overflow-hidden rounded-3xl border bg-card p-4"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -left-12 size-48 rounded-full bg-good/15 blur-3xl dark:bg-good/10"
        />
        <div className="relative flex gap-3.5">
          <motion.span
            className="grid size-10 shrink-0 place-items-center rounded-2xl bg-good/12 text-good"
            animate={{ rotate: [0, -14, 11, -6, 3, 0] }}
            transition={{ duration: 1, delay: 0.4, ease: 'easeInOut' }}
          >
            <BellRing className="size-5" />
          </motion.span>
          <div className="min-w-0">
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
          </div>
        </div>
        <p className="relative mt-3.5 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
          Esta aba só aparece quando há avisos. Quando você sai dela, eles contam como lidos e ela some.
        </p>
      </motion.section>

      <NewsList items={items} />

      {items.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
          className="flex flex-col items-center gap-2 rounded-3xl border bg-card px-6 py-10 text-center"
        >
          <CheckCheck className="size-7 text-good" />
          <p className="font-semibold">Tudo lido</p>
          <p className="text-sm text-muted-foreground">Quando surgir algo novo, esta aba volta a aparecer.</p>
        </motion.div>
      )}
    </Screen>
  )
}
