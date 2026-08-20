# Painel da equipe — Projeto Prisma

Interface para ADMIN/BARBER operarem o dia a dia da barbearia (agenda, colaboradores,
catálogo, financeiro). Projeto independente da API — consome `../` (Fastify) como
qualquer outro cliente HTTP, sem acesso direto ao banco.

## Stack

React + TypeScript + Vite, Tailwind CSS v4, shadcn/ui (componentes copiados pro
repo, não uma dependência opaca), React Router, TanStack Query.

## Rodando localmente

```bash
cp .env.example .env    # VITE_API_URL aponta pro backend local por padrão
pnpm install
pnpm dev                  # http://localhost:5173 — a API precisa estar no ar em :3000
```

```bash
pnpm test      # baseline: refresh concorrente, autenticação, agenda, financeiro
pnpm build     # tsc -b && vite build
```

## Design

Tema dark fixo (sem alternância de tema) — tokens em `src/index.css`. Fraunces pra
títulos/wordmark/números de relatório, Instrument Sans pro resto, IBM Plex Mono pra
código/valores em tabela. A assinatura visual do painel é o "talão de senha"
(`StatusBadge`, em `src/components/shared/`) — o entalhe recortado na borda esquerda de
todo status de agendamento.

## Autenticação

Login de equipe (`/auth/staff/login`). Access token só em memória (nunca em
`localStorage`); refresh token opaco, guardado via `src/lib/auth/tokenStore.ts` — único
lugar que toca o `localStorage`. `src/lib/api/client.ts` renova a sessão sozinho num
401, com renovação *single-flight* (uma promise só, compartilhada entre chamadas
concorrentes) — o backend revoga todas as sessões se detectar reuso de refresh token, e
duas renovações paralelas com o mesmo token derrubariam o login inteiro.

## Estrutura

```
src/
  lib/
    api/         # wrapper de fetch + tipos + uma função por endpoint, por módulo da API
    auth/         # sessão (fora do React), tokenStore, AuthContext
  components/
    ui/            # primitivas shadcn/ui
    layout/         # AppLayout (sidebar + shell)
    shared/          # StatusBadge, RequireAuth, RequireAdmin, ClientPicker
  features/
    auth/           # Login, esqueci minha senha, redefinir senha
    agenda/          # agenda do dia, ciclo de vida, novo agendamento
    staff/            # colaboradores (perfil/serviços/grade/folgas)
    catalog/           # categorias e serviços
    financeiro/         # pedidos, pacotes, fidelidade, relatórios (ADMIN)
```

## Papéis

`ADMIN` vê tudo. `BARBER` vê a própria agenda (a API já escopa sozinha — o filtro de
barbeiro nem aparece pra ele) e o menu esconde "Equipe e catálogo" e a aba "Relatórios"
do Financeiro — não é o frontend decidindo permissão, é só evitar abrir uma tela que a
API recusaria com 403.

## Testes

Baseline fino — não persegue cobertura ampla, cobre os pontos onde uma regressão
silenciosa dói de verdade (revisita a decisão original de deixar este painel sem
testes por ser "ferramenta interna" — ver `client-portal/README.md` §Testes — porque
ainda assim há pontos de risco reais e silenciosos):

- `lib/api/client.test.ts` — a guarda de concorrência do refresh: N chamadas
  concorrentes tomando 401 disparam **uma** única renovação real via
  `/auth/staff/refresh`, não N.
- `features/auth/{LoginPage,ForgotPasswordPage}.test.tsx` — erro de credencial vai pro
  campo certo (senha vs. banner), falha de rede tem mensagem própria, mensagem de
  "esqueci a senha" é idêntica pra e-mail existente e inexistente (anti-enumeração).
- `features/agenda/NewAppointmentDialog.test.tsx` — resolução de barbeiro no modo
  "qualquer barbeiro disponível", reset de horário ao trocar serviço/barbeiro,
  `SLOT_TAKEN` recarregando disponibilidade, corpo exato do `POST /appointments`.
- `features/agenda/{CompleteAppointmentDialog,RescheduleDialog}.test.tsx` — fetch
  condicional por forma de pagamento, filtro de pacotes elegíveis, remarcação em um
  clique só (sem passo de confirmação) com todos os horários desabilitados durante a
  requisição.
- `features/financeiro/PackageFormDialog.test.tsx` — conversão de preço reais →
  centavos, incluindo o caso de arredondamento de ponto flutuante (`"19.9"` não pode
  virar `1989`) e o round-trip de edição.

Diferente de `client-portal/`, nenhum widget interativo de terceiros é usado aqui
(todo seletor é `<select>`/`<input>` nativo) — não há necessidade do `fireEvent.click`
que o `Calendar` do portal exige.
