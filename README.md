# Chamada

App (PWA, mobile first) para acompanhar as disciplinas da UFSC: aulas do dia, presença em cada
disciplina, simulador de faltas e prazos das atividades do Moodle. O estudante entra com o próprio
idUFSC e o app só monta a interface: não há banco de dados, os dados ficam no aparelho.

## Telas

- **Hoje**: aulas do dia (ou do próximo dia de aula) com a presença atual, quanto fica **se faltar**
  e **se for**, e os prazos pendentes da disciplina, do mais próximo ao mais distante.
- **Presença**
  - *Visão geral*: barra de presença por disciplina (vermelho abaixo de 75%, laranja de 75% a 84%,
    verde a partir de 85%), faltas atuais, faltas permitidas e próxima aula.
  - *Disciplinas*: porcentagem de cada disciplina num relance; toque abre o detalhe (histórico de
    chamadas, horário, próximas aulas).
  - *Simulador*: escolha uma ou mais disciplinas e quantas vezes faltar (igual para todas ou por
    disciplina). A simulação usa as próximas aulas reais de cada disciplina a partir de agora (numa
    terça, uma disciplina de segunda e quarta falta na quarta e na segunda seguinte) e compara a
    barra atual com a barra depois das faltas.
  - *Manual*: o estudante registra cada dia de aula que faltou, com uma anotação opcional
    ("consulta médica"). Só essas faltas contam. Uma falta = um dia de aula, e vale as aulas daquele
    dia da semana na grade do CAGR. Aulas do semestre = aulas por semana × 18 semanas; o limite é
    25% delas, mostrado em dias: Redes (2 + 2 aulas por semana) tem 72 aulas, pode faltar 18 aulas,
    ou seja, 9 dias; a 10ª falta deixa a presença em 72%.
- **Atividades**: o que ainda precisa ser feito, com prazo e disciplina, agrupado por data
  (atrasadas, hoje, amanhã, próximos 7 dias, mais adiante). Não aparecem atividades entregues
  (pelo estudante ou pelo grupo), já avaliadas (provas em sala), encerradas para envio ou escolhas
  de grupo já feitas: a linha do tempo do Moodle ainda lista essas como pendentes, então cada uma é
  conferida no web service do próprio módulo (`mod_assign_get_submission_status`,
  `mod_quiz_get_user_attempts`, grupos do curso).

## Avisos

- **Falta lançada no Moodle**: quando o professor registra uma falta que ainda não está na aba
  Manual, aparece um aviso com atalho para adicioná-la (o formulário já vem com a disciplina e o dia).
- **Trabalho em grupo enviado por outra pessoa**: o Moodle não diz quem enviou o trabalho de um
  grupo. O app compara o horário do envio com o último acesso do estudante àquela disciplina
  (`lastaccess`, que só muda quando se abre uma página do Moodle): se o envio foi depois desse
  acesso, não foi ele, e o aviso aparece. Envios do próprio estudante não geram aviso.
- **Onde aparecem**: na aba **Avisos** da barra de navegação, que só aparece quando há novidades e mostra quantas são; ao sair dela, os avisos contam como lidos e a aba é "esmagada" para fora da barra. Também há um aviso rápido na hora em que chegam. Com o app fechado, só no
  Android com o app instalado: o service worker (`src/sw.ts`) usa Periodic Background Sync, e o
  Android escolhe quando acordar o app (algumas vezes por dia). O iPhone não deixa apps da web rodarem
  fechados, então lá os avisos aparecem quando o app abre.
- O token do Moodle continua só no aparelho: para checar em segundo plano, o service worker lê uma
  cópia dele no IndexedDB do próprio celular. A primeira checagem só registra o que já existe, então
  faltas e envios antigos nunca viram aviso.

## Regras de presença

- A porcentagem é a do Moodle: pontos nas chamadas já registradas ÷ máximo dessas chamadas. Cada
  aula de 50 minutos vale 1 ponto (um encontro de 2 aulas vale 2).
- Faltas permitidas: 25% de todas as aulas cadastradas na atividade Presença (resolução da UFSC:
  mínimo de 75% de frequência).
- "Se faltar / se for" e o simulador consideram as próximas aulas ainda sem chamada.

## De onde vêm os dados

```
app (PWA) ──POST /api/login──▶ função Vercel (gru1) ──▶ idUFSC (CAS) ──▶ Moodle: token do app
          │                                                          └─▶ CAGR: grade de horários
          └─POST /api/sync───▶ função Vercel ──▶ Moodle: web services + página da Presença
```

- **Login** (`api/login.ts`): faz o login do idUFSC como o app oficial do Moodle faz
  (`admin/tool/mobile/launch.php`), recebe o token do app, lê a grade do CAGR com a mesma sessão e
  faz a primeira sincronização. A resposta é um stream NDJSON com o progresso de cada etapa.
  Se a UFSC mostrar o questionário do Collecta, o app toca em "Responder mais tarde" (nunca em
  "Não tenho interesse", que é irreversível) e avisa o estudante.
- **Sincronização** (`api/sync.ts`): usa só o token do Moodle, sem senha. Atividades vêm dos web
  services (calendário + linha do tempo). As presenças vêm da página da atividade Presença
  (`mod/attendance/view.php`, só leitura), porque o plugin não expõe web services ao app; a sessão
  web é aberta com o autologin do app do Moodle (o Moodle limita a 1 a cada 6 minutos).
- **Faltas anotadas** (`api/notes.ts`): ficam no aparelho (funciona offline) e sincronizam com um
  Postgres no Neon (São Paulo). A identidade é a conta do Moodle: a cada leitura ou gravação o
  servidor pergunta ao Moodle de quem é o token. A tabela guarda só uma HMAC do id do Moodle (nunca
  o id, nome ou matrícula) e as anotações cifradas com AES-256-GCM; as duas chaves derivam de
  `NOTES_SECRET`, que só existe no ambiente da Vercel. Entre aparelhos, cada falta é sincronizada
  separadamente (vale a versão mais recente, e uma falta apagada continua apagada).
- **Privacidade**: a senha só passa pela função no login e não é salva nem registrada em log. O
  app guarda no aparelho (localStorage) o token do Moodle, a sessão web e os dados exibidos.
  Sair apaga tudo do aparelho (as faltas anotadas continuam salvas na conta).

## Rodar localmente

`.env.local` (fora do git) com `DATABASE_URL` (Neon) e `NOTES_SECRET` (32 bytes em base64), as
mesmas variáveis do projeto na Vercel.

```bash
npm install
npm run dev          # Vite + as funções de api/ servidas pelo próprio Vite
npm run build        # typecheck + build de produção (dist/ com service worker)
npm run lint
```

Ícones do PWA: `npx pwa-assets-generator` (a partir de `public/logo.svg`).

## Stack

Vite + React + TypeScript, Tailwind CSS v4 + shadcn/ui (Radix, vaul), motion (transições, gestos
e layout), sonner (toasts), vite-plugin-pwa (manifest + service worker do Workbox), wouter e
zustand. Deploy na Vercel (funções Node em `api/`, região `gru1`).

App não oficial, sem vínculo com a UFSC.
