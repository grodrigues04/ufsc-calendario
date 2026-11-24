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
- **Atividades**: todas as atividades com prazo do semestre, de qual disciplina vêm, agrupadas por
  data (atrasadas, hoje, amanhã, próximos 7 dias, mais adiante).

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
- **Privacidade**: a senha só passa pela função no login e não é salva nem registrada em log. O
  app guarda no aparelho (localStorage) o token do Moodle, a sessão web e os dados exibidos.
  Sair apaga tudo.

## Rodar localmente

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
