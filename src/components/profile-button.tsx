import { motion } from 'motion/react'
import { useApp } from '@/lib/store'
import { useUi } from '@/lib/ui'

export function initials(name: string | undefined): string {
  if (!name) return '·'
  const parts = name.split(' ').filter((part) => part.length > 2)
  return ((parts[0]?.[0] ?? '') + (parts.at(-1)?.[0] ?? '')).toUpperCase() || '·'
}

export function ProfileButton() {
  const student = useApp((state) => state.student)
  const syncing = useApp((state) => state.syncing)
  const setProfileOpen = useUi((state) => state.setProfileOpen)
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      onClick={() => setProfileOpen(true)}
      aria-label={syncing ? 'Atualizando — abrir perfil' : 'Abrir perfil'}
      className="relative mb-1 grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-[13px] font-semibold"
    >
      {initials(student?.name)}
      {syncing && (
        <motion.span
          aria-hidden
          className="absolute -inset-[3px] rounded-full border-2 border-transparent border-t-foreground/70"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
        />
      )}
    </motion.button>
  )
}
