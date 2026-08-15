# Projeto Prisma

API de agendamento e gestão para barbearia — Node.js + TypeScript + Fastify + Prisma +
PostgreSQL. Cobre agenda com garantia real contra double booking, ciclo de vida completo
do atendimento, pagamentos/pacotes/fidelidade, mini e-commerce, avaliações, dashboards, e
autenticação separada para clientes (portal) e equipe (admin/barbeiro).

O desenho completo — modelagem de dados, decisões de arquitetura e a mecânica de
concorrência — está em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md). Este README é sobre
**rodar e operar** o que já existe.

## Stack

- **Runtime:** Node.js 20+, TypeScript, [tsx](https://github.com/privatenumber/tsx) (dev sem build step)
- **HTTP:** Fastify 5 (`@fastify/jwt`, `@fastify/cors`, `@fastify/rate-limit`, `@fastify/sensible`)
- **Banco:** PostgreSQL 16 (via Docker Compose) + Prisma ORM
- **Validação:** Zod em toda borda de entrada (body/query/params)
- **Gerenciador de pacotes:** pnpm

## Pré-requisitos

- Node.js 20+
- pnpm (`corepack enable` já resolve, se estiver usando nvm/Volta)
- Docker + Docker Compose (para o Postgres local)

## Início rápido

```bash
pnpm install
cp .env.example .env
pnpm db:up          # sobe o Postgres em Docker
pnpm prisma:deploy   # aplica todas as migrações
pnpm db:seed          # popula: 1 admin, 1 barbeiro, 2 serviços, 1 cliente
pnpm dev              # servidor em http://localhost:3000, com watch
```

Verifique que subiu:

```bash
curl http://localhost:3000/health/db
# {"status":"ok","database":"up"}
```

Login de equipe criado pelo seed (**troque em qualquer ambiente que não seja local**):

| E-mail | Senha | Papel |
|---|---|---|
| `dono@barbearia.dev` | `trocar123` | ADMIN |
| `joao@barbearia.dev` | `trocar123` | BARBER |

O cliente de exemplo (Maria, `+5511999990099`) entra pelo fluxo de OTP — veja
[Autenticação](#autenticação).

## Variáveis de ambiente

Todas em `.env.example`. Nenhuma tem efeito além do que o nome sugere, exceto:

| Variável | Obrigatória | Efeito |
|---|---|---|
| `DATABASE_URL` | sim | string de conexão do Postgres |
| `JWT_SECRET` | só em produção | assina os tokens de cliente e de equipe. Em dev, cai num valor padrão inseguro com aviso — **a aplicação recusa subir com o valor padrão se `NODE_ENV=production`** |
| `CORS_ORIGINS` | recomendado em produção | lista de origens de navegador autorizadas, separada por vírgula. Sem definir: em dev libera qualquer `localhost`/`127.0.0.1`; **em produção fecha todas as origens por padrão** (loga aviso, não derruba o processo — CORS fechado é seguro, só inconveniente) |
| `RESEND_API_KEY` | recomendado para e-mail | chave da [Resend](https://resend.com/api-keys). Sem ela, notificações por e-mail ficam sempre `FAILED` (logado, servidor sobe normal — WhatsApp continua funcionando via n8n) |
| `EMAIL_FROM` | não | remetente dos e-mails transacionais (padrão usa o domínio de teste da Resend) |
| `SHOP_NAME` | não | nome exibido no cabeçalho dos e-mails (padrão `"Sua Barbearia"`) |
| `PORT`, `HOST` | não | onde o Fastify escuta (padrão `3000` / `0.0.0.0`) |
| `NODE_ENV` | não | `development` liga log bonito (`pino-pretty`) e as checagens de `JWT_SECRET`/`CORS_ORIGINS` acima |
| `LOG_LEVEL` | não | nível do pino (`info` por padrão) |

## Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` | servidor com watch (tsx), carrega `.env` |
| `pnpm build` / `pnpm start` | build de produção (`tsc`) e execução do `dist/` |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:up` / `pnpm db:down` | sobe/derruba o Postgres do `docker-compose.yml` |
| `pnpm db:seed` | popula dados de exemplo (idempotente — pode rodar de novo) |
| `pnpm prisma:migrate` | cria e aplica uma nova migração a partir do `schema.prisma` — **leia [Migrações](#migrações-e-a-pegadinha-do-time_range) antes** |
| `pnpm prisma:deploy` | aplica migrações pendentes sem gerar novas (uso em CI/produção) |
| `pnpm prisma:studio` | GUI do Prisma para inspecionar o banco |
| `pnpm test:concurrency` | dispara 50 requisições simultâneas para o mesmo horário e confirma que só uma vence — o teste que valida a garantia anti-double-booking |

## Estrutura do projeto

```
prisma/
  schema.prisma          # todas as tabelas
  migrations/             # uma pasta por migração, aplicadas em ordem
  seed.ts                 # dados de exemplo
src/
  app.ts                  # monta o Fastify e registra todos os módulos
  server.ts                # sobe o servidor + o loop de background (webhooks/notificações)
  config/env.ts            # validação das variáveis de ambiente (Zod)
  lib/                      # utilitários sem estado: intervalos de tempo, senha, tokens, erro
  plugins/auth.ts           # os guards de autenticação (ver seção abaixo)
  modules/
    scheduling/             # camada 1: cálculo de disponibilidade
    appointments/            # camada 2/3: reserva transacional + ciclo de vida
    barbers/, catalog/       # CRUD de colaboradores e catálogo de serviços
    auth/, portal/           # login (OTP + staff) e as rotas /me/* do cliente
    outbox/                   # outbox transacional + webhooks para o n8n
    notifications/            # lembretes/confirmação automática agendados
    payments/, packages/, loyalty/   # financeiro, pacotes e fidelidade
    products/, orders/         # mini e-commerce
    reviews/                    # avaliações
    reports/                     # dashboards de agendamento e financeiro
scripts/
  concurrency-test.ts       # teste de carga da constraint anti-double-booking
```

Cada módulo segue o mesmo padrão: `*.schema.ts` (Zod) → `*.service.ts` (regra de negócio,
Prisma) → `*.routes.ts` (Fastify, só validação + guard de auth + chamada ao service).

## Autenticação

Duas sessões completamente separadas — um token de uma nunca abre rota da outra (`403`
se tentar):

Ambas seguem o mesmo desenho de sessão (access token curto + refresh token opaco de 30
dias, guardado só como hash em `refresh_tokens` — nunca em texto puro), implementado uma
vez em `src/lib/refresh-tokens.ts` e reaproveitado pelas duas.

**Cliente (portal):** `POST /auth/otp/request` → recebe um código de 6 dígitos por
WhatsApp (em dev, a resposta inclui `devCode` fora de produção) → `POST /auth/otp/verify`
→ access token de 30min + refresh token. `POST /auth/otp/refresh` rotaciona o par;
`POST /auth/otp/logout` encerra a sessão atual. Rotas `/me/*`.

**Equipe (`ADMIN`/`BARBER`):** `POST /auth/staff/login` (e-mail+senha) → mesmo par de
tokens. `POST /auth/staff/refresh` e `POST /auth/staff/logout` — mesma mecânica.

Em ambos: cada uso de `refresh` troca o token por um novo e revoga o anterior
(rotação) — reapresentar um refresh token já usado (rotacionado ou de logout) é tratado
como sessão comprometida e derruba **todos** os dispositivos daquele usuário. Um refresh
token de cliente não vira sessão de equipe (nem vice-versa): a tentativa é recusada e
**também invalida o token usado na tentativa** — quem faz esse teste sem querer precisa
logar de novo.

Dois níveis de guarda em `src/plugins/auth.ts`:

- **`requireStaffAuth`** — `ADMIN` ou `BARBER`. Operações do dia a dia. Um `BARBER` fica
  **escopado à própria agenda**: só vê/mexe nos próprios agendamentos, grade e folgas —
  tentar agir na agenda de um colega vira `403` (`assertBarberScope`).
- **`requireAdminAuth`** — só `ADMIN`. Decisões de dono: cadastrar/remover colaborador,
  preço de catálogo/pacote/produto, webhooks (guardam segredos), relatórios financeiros.

**Bootstrap do primeiro admin:** `POST /admins` fica aberto só enquanto não existir
nenhum `ADMIN` no banco. Depois disso, passa a exigir um `ADMIN` autenticado.

**Proteção contra força bruta no login de equipe:** limite de 10 requisições/minuto por
IP (`@fastify/rate-limit`) + bloqueio de conta por 15min após 5 senhas erradas seguidas
(mesmo a senha certa é recusada enquanto bloqueada).

### API key para máquinas (n8n e outros consumidores server-to-server)

Terceira via de autenticação, separada de cliente e equipe — pensada pra quem não é um
humano logando (`docs/ARQUITETURA.md` §02). `POST /api-keys` (`ADMIN`) gera uma chave
`sk_...` com um ou mais escopos; **a chave completa só aparece nessa resposta, uma vez**
— o banco guarda só o hash (`src/lib/tokens.ts`), igual à senha de equipe e ao refresh
token. Listagens mostram só `keyPrefix` (os 8 primeiros caracteres) para identificar
qual chave é qual.

Escopos hoje (`src/modules/apikeys/scopes.ts`): `events:read` (`GET /events`, o fallback
de pull do outbox) e `notifications:write` (`PATCH /notifications/:id`, callback
reportando o resultado real de uma entrega). Essas duas rotas aceitam **ou** uma sessão
de equipe **ou** uma API key com o escopo certo — `requireStaffOrApiKey` em
`src/plugins/auth.ts` decide qual caminho seguir pelo prefixo do token, sem misturar os
dois. Chave sem o escopo necessário vira `403 INSUFFICIENT_SCOPE` (a chave é válida, só
não pode fazer aquilo) — diferente de `401`, que é chave ausente/inválida/revogada.

```bash
curl -X POST http://localhost:3000/api-keys \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"n8n produção","scopes":["events:read","notifications:write"]}'
# {"id":"...","keyPrefix":"sk_a1b2c3d4","key":"sk_a1b2c3d4...(guarde agora — não aparece de novo)"}
```

## Referência de endpoints

Legenda: 🌐 público · 🔑 cliente (OTP) · 👤 equipe (`ADMIN`/`BARBER`, `BARBER` escopado à
própria agenda) · 🔒 só `ADMIN` · 🤖 aceita também API key com o escopo indicado

### Agenda e disponibilidade

| | Rota | Descrição |
|---|---|---|
| 🌐 | `GET /availability/barbers` | barbeiros com vaga para os serviços/data pedidos |
| 🌐 | `GET /availability/days` | dias do mês com pelo menos uma vaga |
| 🌐 | `GET /availability/slots` | horários disponíveis (aceita `barberId=any`) |

### Agendamentos (equipe)

| | Rota | Descrição |
|---|---|---|
| 👤 | `POST /appointments` | cria em nome de um cliente |
| 👤 | `GET /appointments` | lista (filtros: barbeiro, cliente, status, período) |
| 👤 | `GET /appointments/:id` · `.../history` | detalhe e trilha de auditoria |
| 👤 | `POST .../confirm` · `.../check-in` · `.../complete` · `.../cancel` · `.../no-show` · `.../reschedule` | transições do ciclo de vida |

### Portal do cliente (`/me/*`, sessão OTP)

| | Rota | Descrição |
|---|---|---|
| 🔑 | `GET /me` · `PATCH /me` | perfil |
| 🔑 | `GET /me/appointments` · `.../last` | histórico e "repetir último" |
| 🔑 | `POST /me/appointments` | agendar (aceita `repeatOf`) |
| 🔑 | `POST .../cancel` · `.../reschedule` · `.../review` | ações sobre o próprio agendamento |
| 🔑 | `GET /me/packages` · `GET /me/loyalty` | saldo de pacotes e pontos |

### Colaboradores e catálogo

| | Rota | Descrição |
|---|---|---|
| 🌐 | `GET /barbers` · `GET /barbers/:id` · `GET /barbers/:id/reviews` | vitrine |
| 🔒 | `POST` · `PATCH` · `DELETE /barbers/:id` · `PUT .../services` | cadastro e habilitação |
| 👤 | `GET`/`PUT /barbers/:id/schedule` · `POST .../time-off` · `GET .../agenda` | grade e agenda (escopado) |
| 🌐 | `GET /service-categories` · `GET /services` · `GET /services/:id` · `.../barbers` | vitrine |
| 🔒 | `POST`/`PATCH` em ambos acima | catálogo e preço |

### Financeiro, pacotes e fidelidade

| | Rota | Descrição |
|---|---|---|
| 🌐 | `GET /packages` · `GET /packages/:id` | catálogo de pacotes |
| 🔒 | `POST`/`PATCH /packages` | definir pacote |
| 👤 | `POST`/`GET /clients/:id/packages` | vender/consultar pacote de um cliente |
| 👤 | `GET /clients/:id/loyalty` | saldo de pontos de um cliente |
| 🔒 | `GET /payments` | listagem financeira |

### Loja e avaliações

| | Rota | Descrição |
|---|---|---|
| 🌐 | `GET /products` · `GET /products/:id` | vitrine (nunca expõe custo) |
| 🔒 | `POST`/`PATCH /products` · imagens · movimentações de estoque | gestão de inventário |
| 👤 | `POST`/`GET /orders` · `GET /orders/:id` | venda no balcão |
| 🌐 | `GET /barbers/:id/reviews` | nota pública do barbeiro |
| 👤 | `GET /reviews` | listagem administrativa |

### Integração e operação

| | Rota | Descrição |
|---|---|---|
| 🔒 | `GET`/`POST`/`PATCH`/`DELETE /webhook-endpoints` | assinaturas de eventos para o n8n |
| 🔒 | `GET`/`POST`/`PATCH`/`DELETE /api-keys` | emissão de chaves de máquina |
| 👤🤖 | `GET /events` | fallback de pull do outbox — staff **ou** API key `events:read` |
| 👤 | `GET /notifications` | fila de lembretes/confirmações agendadas |
| 👤🤖 | `PATCH /notifications/:id` | callback de entrega — staff **ou** API key `notifications:write` |
| 🔒 | `GET /reports/appointments` · `GET /reports/revenue` | dashboards |
| 🌐 | `GET /health` · `GET /health/db` | liveness/readiness |

## Integração com n8n

Todo evento de negócio (agendamento criado/confirmado/cancelado/concluído, notificação
pronta para envio, avaliação recebida) vai para uma tabela de outbox e é entregue por
webhook assinado (`X-Prisma-Signature`, HMAC-SHA256) a quem estiver cadastrado em
`POST /webhook-endpoints`. Retry com backoff exponencial; endpoint some desativado
automaticamente após falhas consecutivas demais. `GET /events?since=` é o fallback de
pull para quando o push não é viável.

Um n8n já roda em Docker nesta máquina (`docker ps` mostra o container `n8n`) — é o alvo
natural para configurar um endpoint de teste.

## Notificações por e-mail (Resend)

WhatsApp e e-mail são entregues de dois jeitos diferentes, de propósito. WhatsApp precisa
de um intermediário com acesso à API oficial — por isso vira `outbox_event` e o n8n
entrega. E-mail transacional a própria API já resolve, então `notifications` com
`channel: EMAIL` são enviadas **direto pela [Resend](https://resend.com)**, sem passar
pelo outbox — ver `src/modules/notifications/notification-dispatcher.ts`.

Um cliente com e-mail cadastrado (`PATCH /me { "email": "..." }`, sujeito ao mesmo
unicidade de `POST /admins`/`POST /barbers` — `409 EMAIL_TAKEN` se já estiver em uso)
recebe lembrete de agendamento e recibo **nos dois canais**, WhatsApp e e-mail, em
notificações separadas (`src/modules/notifications/scheduler.ts`). Sem e-mail
cadastrado, só WhatsApp — nunca falha por falta de endereço. O código de login (OTP)
continua só por WhatsApp: nesse momento pode nem existir cliente ainda para se buscar um
e-mail.

Sem `RESEND_API_KEY` configurada, todo envio de e-mail falha (`status: FAILED`,
logado no console com o motivo) — o resto do sistema continua funcionando normalmente,
é só o canal de e-mail que fica inerte até a chave ser configurada.

## Migrações e a pegadinha do `time_range`

A tabela `appointments` tem uma coluna gerada (`time_range tstzrange GENERATED ALWAYS
AS (...) STORED`) que sustenta a constraint `EXCLUDE USING gist` — a garantia real
contra double booking (ver `docs/ARQUITETURA.md`, seção 03). O Prisma **não entende**
colunas geradas: toda vez que você rodar `prisma migrate dev` depois de mudar o schema,
ele vai tentar "corrigir" essa coluna gerando um diff espúrio como:

```sql
DROP INDEX "appointments_time_range_idx";
ALTER TABLE "appointments" ALTER COLUMN "time_range" DROP DEFAULT;
```

Aplicar isso quebra com `column "time_range" is a generated column`. **Sempre que uma
migração tocar em algo perto disso:**

1. Gere só o rascunho: `npx prisma migrate dev --name algo --create-only`
2. Abra o `migration.sql` gerado e **apague as duas linhas acima** (deixe um comentário
   no lugar — é o padrão usado em todas as migrações deste projeto, dá pra copiar)
3. Aplique: `npx prisma migrate dev`

Depois de aplicar, é normal o CLI perguntar "Enter a name for the new migration" e
parecer travado — é só o mesmo ruído tentando se re-detectar. `Ctrl+C` é seguro, a
migração já foi aplicada (confirme com `npx prisma migrate status`).

## Testando a garantia anti-double-booking

```bash
pnpm db:seed              # garante que brb_joao e o admin de teste existem
pnpm dev                   # em outro terminal
pnpm test:concurrency       # dispara 50 requisições simultâneas para o mesmo horário
```

Saída esperada: exatamente 1× `201 Created`, 49× `409 SLOT_TAKEN`, 1 linha no banco.
Configurável via `API_URL`, `CONCURRENCY`, `STAFF_EMAIL`, `STAFF_PASSWORD`.

## O que ainda não existe

Levantamento honesto do que falta — nada aqui bloqueia o sistema funcionar, mas separa
"roda no meu Postgres local" de "pronto pra produção":

- **Testes automatizados:** tudo foi validado manualmente contra Postgres real durante o
  desenvolvimento; não há suíte que rode sozinha nem CI (`.github/workflows` não existe).
- **Sem revogação de sessão em massa** a pedido do usuário (só existe via detecção de
  reuso de refresh token).
- **Escopo de API key ainda pequeno:** só cobre as duas rotas que o n8n usa hoje
  (`events:read`, `notifications:write`) — não dá pra emitir uma chave que, por exemplo,
  crie agendamentos em nome do sistema.
- **Sem expiração de pontos de fidelidade** nem limpeza de refresh tokens expirados na
  tabela (acumulam, não afeta segurança).
- **Sem `Dockerfile` da própria API** — só o Postgres está containerizado; rodar a API
  hoje é sempre via `pnpm dev`/`pnpm start` direto no host.
- **Recuperação de senha de equipe** é só reset manual por outro admin — sem fluxo de
  "esqueci minha senha" por e-mail.
