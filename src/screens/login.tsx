import { cn } from 'cn'
import { Check, Eye, EyeOff, LoaderCircle, LockKeyhole } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import type { LoginStep } from '@shared/types'
import { EASE_OUT } from '@/components/tone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiFailure, login } from '@/lib/api'
import { useApp } from '@/lib/store'

const STEPS: Array<{ step: LoginStep; label: string }> = [
  { step: 'auth', label: 'Verificando seu idUFSC' },
  { step: 'moodle', label: 'Conectando ao Moodle' },
  { step: 'cagr', label: 'Lendo sua grade no CAGR' },
  { step: 'sync', label: 'Buscando presenças e prazos' },
]

export function LoginScreen() {
  const signIn = useApp((state) => state.signIn)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [step, setStep] = useState<LoginStep | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!username.trim() || !password) return
    setError(null)
    setStep('auth')
    try {
      const result = await login(username.trim(), password, setStep)
      setPassword('')
      signIn(result)
      if (result.notices.includes('collecta')) {
        toast('A UFSC tem uma avaliação para você', {
          description: 'O app tocou em “Responder mais tarde”. Responda quando quiser em sistemas.ufsc.br.',
          duration: 8000,
        })
      }
      if (result.notices.includes('cagr_unavailable')) {
        toast('Não consegui ler sua grade no CAGR', { description: 'Os horários vêm só do Moodle por enquanto.' })
      }
    } catch (failure) {
      setStep(null)
      setError(failure instanceof ApiFailure ? failure.message : 'Não foi possível entrar agora.')
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 pt-safe pb-safe">
      <motion.img
        src="/logo.svg"
        alt=""
        width={64}
        height={64}
        initial={{ opacity: 0, scale: 0.7, rotate: -12 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: 'spring', bounce: 0.35, duration: 0.7 }}
        className="size-16 rounded-[18px] shadow-lg shadow-black/10"
      />
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.08 }}>
        <h1 className="mt-6 text-[34px] leading-tight font-semibold tracking-tight">Chamada</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">Sua presença, aulas do dia e prazos do Moodle UFSC num lugar só.</p>
      </motion.div>

      <div className="mt-8 min-h-[236px]">
        <AnimatePresence mode="wait" initial={false}>
          {step ? (
            <LoginProgress key="progress" current={step} />
          ) : (
            <motion.form
              key="form"
              onSubmit={submit}
              initial={{ opacity: 0, y: 10 }}
              // After a failed login the form comes back with a short shake.
              animate={error ? { opacity: 1, y: 0, x: [0, -10, 9, -6, 4, 0] } : { opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: error ? 0.42 : 0.3, ease: EASE_OUT, delay: error ? 0 : 0.12 }}
              className="space-y-3"
            >
              <Input
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="text"
                placeholder="idUFSC, matrícula ou CPF"
                aria-label="idUFSC, matrícula ou CPF"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="h-12 rounded-2xl px-4 text-base"
                required
              />
              <div className="relative">
                <Input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Senha"
                  aria-label="Senha"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-12 rounded-2xl px-4 pr-12 text-base"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                  className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                </button>
              </div>
              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden text-sm font-medium text-bad"
                    role="alert"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>
              <Button type="submit" size="lg" className="h-12 w-full rounded-2xl text-[15px]" disabled={!username.trim() || !password}>
                Entrar com idUFSC
              </Button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>

      <p className="mt-2 flex gap-2.5 text-xs leading-relaxed text-muted-foreground">
        <LockKeyhole className="mt-0.5 size-4 shrink-0" />
        <span>
          O login é o oficial da UFSC (idUFSC), feito pelo nosso servidor. Sua senha não é guardada: o app só recebe o acesso do
          Moodle e seus dados ficam neste aparelho. App não oficial.
        </span>
      </p>
    </main>
  )
}

function LoginProgress({ current }: { current: LoginStep }) {
  const currentIndex = STEPS.findIndex((item) => item.step === current)
  return (
    <motion.ol
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      className="space-y-1 rounded-3xl border bg-card p-3"
      aria-live="polite"
    >
      {STEPS.map((item, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'todo'
        return (
          <li key={item.step} className="flex items-center gap-3 rounded-2xl px-2 py-2.5">
            <span
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-300',
                state === 'done' ? 'bg-good text-white' : state === 'active' ? 'bg-secondary' : 'bg-secondary/60',
              )}
            >
              <AnimatePresence mode="wait" initial={false}>
                {state === 'done' ? (
                  <motion.span key="done" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5, duration: 0.4 }}>
                    <Check className="size-4" strokeWidth={3} />
                  </motion.span>
                ) : state === 'active' ? (
                  <motion.span key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                  </motion.span>
                ) : (
                  <span key="todo" className="size-1.5 rounded-full bg-muted-foreground/40" />
                )}
              </AnimatePresence>
            </span>
            <span className={cn('text-[15px] transition-colors duration-300', state === 'todo' ? 'text-muted-foreground' : 'font-medium')}>
              {item.label}
            </span>
          </li>
        )
      })}
      <li className="px-2 pt-1 pb-1 text-xs text-muted-foreground">Isso leva uns 15 segundos na primeira vez.</li>
    </motion.ol>
  )
}
