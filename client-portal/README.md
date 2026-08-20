# Portal do cliente — Projeto Prisma

Interface pra cliente final (não equipe) agendar, cancelar, remarcar e repetir
atendimentos, avaliar o barbeiro, e ver perfil/fidelidade/pacotes. Mobile-first,
projeto independente da API — consome `../` (Fastify) como qualquer outro cliente
HTTP, sem acesso direto ao banco. Sem relação de código com `../frontend` (painel de
equipe) além de compartilhar a identidade visual da marca — login, navegação e fluxos
são completamente diferentes (OTP por telefone, não e-mail+senha; bottom tab bar
mobile, não sidebar desktop).

**v1 é só self-service** — sem compra de pacote/produto (isso exigiria um fluxo de
pagamento que não existe ainda; hoje só a equipe fecha venda no balcão).

## Stack

React + TypeScript + Vite, Tailwind CSS v4, shadcn/ui (componentes copiados pro repo,
não uma dependência opaca), React Router, TanStack Query — mesma stack do painel de
equipe, projeto separado. Vitest + Testing Library pros testes.

## Rodando localmente

```bash
cp .env.example .env    # VITE_API_URL aponta pro backend local por padrão
pnpm install
pnpm dev                  # http://localhost:5174 — a API precisa estar no ar em :3000
```

Porta 5174 (não 5173, o padrão do Vite) — evita colisão rodando lado a lado com
`../frontend`.

```bash
pnpm test      # baseline: refresh concorrente + fluxo de reserva (ver Testes abaixo)
pnpm build     # tsc -b && vite build
```

## Design

Tema dark fixo (sem alternância de tema), mesma paleta do painel de equipe (madeira
escura/latão) — tokens em `src/index.css`, copiados de `../frontend/src/index.css`.
Fraunces pra títulos/wordmark, Instrument Sans pro resto, IBM Plex Mono pra
valores/código.

## Autenticação

Login por OTP via WhatsApp (`/auth/otp/*`) — telefone, não e-mail+senha. Mesmo padrão
de sessão do painel de equipe (access token só em memória, refresh token opaco em
`localStorage`, renovação single-flight com retry único em 401 — `lib/api/client.ts`),
adaptado: sem `role`/`barberId` no `Session`, só existe um tipo de sessão.

## Estrutura

```
src/
  lib/
    api/         wrapper de fetch + tipos + uma função por endpoint, por módulo da API
    auth/         sessão (fora do React), tokenStore, AuthContext
    format.ts      formatação de data/hora/dinheiro (fuso fixo America/Sao_Paulo)
  components/
    ui/            primitivas shadcn/ui
    layout/         AppShell — bottom tab bar (Início/Agendamentos/Reservar/Perfil)
    shared/          AppointmentCard, AppointmentDetailDrawer, StatusBadge, RequireAuth
  features/
    auth/           telefone -> código OTP
    home/            Início: próximo horário, repetir último, fidelidade, avaliação pendente
    appointments/     lista (em breve/histórico) + remarcação
    booking/          wizard de reserva: serviços -> barbeiro -> data/hora -> confirmação
    reviews/           avaliação (estrelas + comentário)
    profile/            perfil (form), fidelidade, pacotes
```

`/reservar` e `/agendamentos/:id/remarcar` ficam **fora** do `AppShell` de propósito —
os dois têm sua própria barra de ação fixa no rodapé, que sobreporia a bottom tab bar
se os dois competissem pelo mesmo espaço.

## Fluxo de reserva

O ponto mais delicado do app: `GET /availability/days` (grid mensal) não aceita
`barberId=any`, mas `GET /availability/slots` aceita. `DateTimeStep` resolve isso
ramificando por barbeiro escolhido — "qualquer barbeiro" usa só `/availability/slots`
(janela fixa de 14 dias, scroller horizontal); barbeiro específico usa
`/availability/days` pro calendário + `/availability/slots` pro dia escolhido. Os dois
caminhos convergem num `barberId` sempre concreto antes de `POST /me/appointments`
(que não aceita `"any"`). `ReschedulePage` reaproveita o mesmo `DateTimeStep`.

## Testes

Baseline deliberadamente fino — não persegue cobertura ampla, cobre os dois pontos
onde uma regressão silenciosa dói de verdade (é o primeiro contato do cliente final
com a marca, sem ninguém por perto pra notar uma quebra):

- `lib/api/client.test.ts` — a guarda de concorrência do refresh: N chamadas
  concorrentes tomando 401 disparam **uma** única renovação real, não N (o backend
  revoga toda sessão se detectar reuso de um refresh token já rotacionado).
- `features/booking/steps/{DateTimeStep,ConfirmStep}.test.tsx` — os dois caminhos do
  fluxo de reserva: "qualquer barbeiro" resolvendo um `barberId` concreto a partir de
  `slot.barberIds[0]`, barbeiro específico via `/availability/days` ->
  `/availability/slots`, o corpo exato de `POST /me/appointments` em cada caso
  (incluindo o atalho "repetir", que manda só `repeatOf` + `startsAt`), e que
  `SLOT_TAKEN` (409) volta pro passo de data/hora em vez de travar na confirmação.

Nota de implementação: o clique num dia do `Calendar` (react-day-picker) usa
`fireEvent.click`, não `userEvent.click` — o componente usa tabindex roving (só o dia
"focado" tem `tabindex=0`) e a heurística de "elemento clicável" do `userEvent` não
reconhece isso em jsdom.
