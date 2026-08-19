# Portal do cliente — Projeto Prisma

Interface pra cliente final (não equipe) agendar, cancelar, remarcar e repetir
atendimentos, ver saldo de fidelidade e pacotes já comprados, e avaliar o barbeiro.
Mobile-first, projeto independente da API — consome `../` (Fastify) como qualquer
outro cliente HTTP, sem acesso direto ao banco. Sem relação de código com `../frontend`
(painel de equipe) além de compartilhar a identidade visual da marca — login,
navegação e fluxos são completamente diferentes (OTP por telefone, não e-mail+senha;
bottom tab bar mobile, não sidebar desktop).

**v1 é só self-service** — sem compra de pacote/produto (isso exigiria um fluxo de
pagamento que não existe ainda; hoje só a equipe fecha venda no balcão).

## Stack

React + TypeScript + Vite, Tailwind CSS v4, shadcn/ui (componentes copiados pro repo,
não uma dependência opaca), React Router, TanStack Query — mesma stack do painel de
equipe, projeto separado.

## Rodando localmente

```bash
cp .env.example .env    # VITE_API_URL aponta pro backend local por padrão
pnpm install
pnpm dev                  # http://localhost:5174 — a API precisa estar no ar em :3000
```

Porta 5174 (não 5173, o padrão do Vite) — evita colisão rodando lado a lado com
`../frontend`.

## Design

Tema dark fixo (sem alternância de tema), mesma paleta do painel de equipe (madeira
escura/latão) — tokens em `src/index.css`, copiados de `../frontend/src/index.css`.
Fraunces pra títulos/wordmark, Instrument Sans pro resto, IBM Plex Mono pra
valores/código.

## Autenticação

**Ainda não implementada** (só o scaffold existe até aqui). Vai ser login por OTP via
WhatsApp (`/auth/otp/*`) — telefone, não e-mail+senha — reaproveitando o padrão de
sessão do painel de equipe (access token só em memória, refresh token opaco em
`localStorage`, renovação single-flight), adaptado: sem `role`/`barberId` no `Session`,
só existe um tipo de sessão. Ver `.claude/plans/` (ou o histórico de commits
"Portal do cliente (Fase N)") pro plano completo.
