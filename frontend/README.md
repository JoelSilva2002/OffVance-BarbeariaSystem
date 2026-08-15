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
    shared/          # StatusBadge, RequireAuth, RequireAdmin
  features/
    auth/           # Login, esqueci minha senha, redefinir senha
    agenda/          # agenda do dia (em construção)
    staff/            # colaboradores e catálogo (em construção)
    financeiro/        # pedidos, pacotes, relatórios (em construção)
```
