import { ArrowLeftRight, BookOpen, Database, GraduationCap, KeyRound, type LucideIcon, RefreshCw, Server, ShieldCheck, Smartphone } from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DrawerClose, DrawerContent, DrawerDescription, DrawerNested, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { useBackToClose } from '@/lib/ui'

/**
 * "Como funciona", opened from the profile: where the data comes from and what is stored, in words
 * for anyone (no programming knowledge needed).
 */
export function HowItWorksSheet({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  // Closing through the button lets the profile below grow back (closing by state would not).
  useBackToClose(open, () => closeRef.current?.click())

  return (
    <DrawerNested open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto min-h-0 w-full max-w-lg overflow-y-auto overscroll-contain px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          <DrawerTitle className="text-xl font-semibold">Como funciona</DrawerTitle>
          <DrawerDescription className="mt-0.5">De onde vêm seus dados e o que fica guardado.</DrawerDescription>

          <Flow />

          <Step icon={KeyRound} title="Você entra com o idUFSC">
            <p>
              O app faz o login no Moodle por você, do mesmo jeito que o app oficial do Moodle. Sua senha só é usada nesse momento
              e não fica salva em lugar nenhum.
            </p>
            <p>
              Em troca, o Moodle entrega uma chave de acesso, que fica guardada só no seu celular. É com ela que o app atualiza
              tudo sem pedir a senha de novo.
            </p>
          </Step>
          <Step icon={BookOpen} title="O app lê suas informações">
            <ul className="list-disc space-y-1 pl-4 marker:text-muted-foreground/60">
              <li>
                <b>Do Moodle:</b> disciplinas, atividades, prazos e a lista de presença de cada disciplina.
              </li>
              <li>
                <b>Do CAGR:</b> sua grade de horários.
              </li>
            </ul>
            <p>Ele só consulta: nunca marca presença, entrega trabalhos ou altera seus dados.</p>
          </Step>
          <Step icon={RefreshCw} title="E atualiza quando você abre">
            <p>Ao abrir o app ou puxar a tela para baixo, ele busca tudo de novo com a chave guardada no seu celular.</p>
          </Step>

          <h3 className="mt-7 mb-2 text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">Onde ficam seus dados</h3>
          <Place icon={Smartphone} title="Só no seu celular">
            <p>
              Presenças, atividades, horários, seu nome e sua matrícula. Quando você toca em <b>Sair</b>, tudo isso é apagado do
              aparelho.
            </p>
          </Place>
          <Place icon={Database} title="No banco de dados do app">
            <ul className="list-disc space-y-1.5 pl-4 marker:text-muted-foreground/60">
              <li>
                As <b>faltas que você anota</b> na aba Manual, para não perdê-las se trocar de celular. Elas ficam criptografadas:
                no banco, viram um código embaralhado.
              </li>
              <li>
                <b>Quando você usou o app</b> (o primeiro e o último dia), para sabermos quantas pessoas usam.
              </li>
              <li>
                Os <b>relatos de bug</b> que você enviar.
              </li>
            </ul>
          </Place>
          <p className="mt-2 flex gap-2.5 rounded-2xl bg-good/10 px-4 py-3 text-[13px] leading-relaxed text-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-good" />
            <span>
              Nada disso leva seu nome, sua matrícula ou seu e-mail. Sua conta aparece só como um código, criado a partir do seu
              número no Moodle, e os relatos de bug não têm nem esse código.
            </span>
          </p>

          <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
            O Chamada não é um app oficial da UFSC. Na dúvida, confira sempre no Moodle.
          </p>
          <DrawerClose asChild>
            <Button ref={closeRef} size="lg" className="mt-4 h-12 w-full rounded-2xl text-[15px]">
              Entendi
            </Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </DrawerNested>
  )
}

/** Phone, the app's server and UFSC's systems: the server only carries requests and answers. */
function Flow() {
  return (
    <figure className="mt-5 rounded-3xl bg-secondary/70 px-3 pt-4 pb-3.5">
      <div className="flex items-start justify-between">
        <FlowNode icon={Smartphone} label="Seu celular" />
        <ArrowLeftRight aria-hidden className="mt-3.5 size-4 shrink-0 text-muted-foreground" />
        <FlowNode icon={Server} label="Servidor do app" />
        <ArrowLeftRight aria-hidden className="mt-3.5 size-4 shrink-0 text-muted-foreground" />
        <FlowNode icon={GraduationCap} label="Moodle e CAGR" />
      </div>
      <figcaption className="mt-3 px-1 text-center text-xs leading-relaxed text-muted-foreground">
        O servidor do app só leva seus pedidos ao Moodle e ao CAGR e traz a resposta. O que eles respondem não fica guardado lá.
      </figcaption>
    </figure>
  )
}

function FlowNode({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex w-[5.5rem] flex-col items-center gap-1.5 text-center">
      <span className="grid size-11 place-items-center rounded-2xl bg-background shadow-xs">
        <Icon className="size-5" />
      </span>
      <span className="text-[11px] leading-tight font-medium">{label}</span>
    </div>
  )
}

function Step({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="mt-5 flex gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary">
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 space-y-1.5 leading-relaxed text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground">
        <h3 className="pt-1.5 text-[15px] leading-snug font-semibold text-foreground">{title}</h3>
        {children}
      </div>
    </section>
  )
}

function Place({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="mt-2 rounded-2xl border bg-card px-4 py-3.5">
      <h4 className="flex items-center gap-2 font-semibold">
        <Icon className="size-4 text-muted-foreground" />
        {title}
      </h4>
      <div className="mt-1.5 leading-relaxed text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground">{children}</div>
    </section>
  )
}
