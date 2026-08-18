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
| `ADMIN_PANEL_URL` | não | URL do painel administrativo. Sem ela (ainda não existe painel — sistema é API-first), o e-mail de "esqueci minha senha" mostra o token cru em vez de um link |
| `SHOP_NAME` | não | nome exibido no cabeçalho dos e-mails (padrão `"Sua Barbearia"`) |
| `PORT`, `HOST` | não | onde o Fastify escuta (padrão `3000` / `0.0.0.0`) |
| `NODE_ENV` | não | `development` liga log bonito (`pino-pretty`) e as checagens de `JWT_SECRET`/`CORS_ORIGINS` acima |
| `LOG_LEVEL` | não | nível do pino (`info` por padrão) |

## Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` | servidor com watch (tsx), carrega `.env` |
| `pnpm build` / `pnpm start` | build de produção (`tsc`) e execução do `dist/` |
| `pnpm typecheck` | `tsc --noEmit` no `src/` e em `tests/` (`tsconfig.test.json`) |
| `pnpm db:up` / `pnpm db:down` | sobe/derruba o Postgres do `docker-compose.yml` |
| `pnpm db:seed` | popula dados de exemplo (idempotente — pode rodar de novo) |
| `pnpm prisma:migrate` | cria e aplica uma nova migração a partir do `schema.prisma` — **leia [Migrações](#migrações-e-a-pegadinha-do-time_range) antes** |
| `pnpm prisma:deploy` | aplica migrações pendentes sem gerar novas (uso em CI/produção) |
| `pnpm prisma:studio` | GUI do Prisma para inspecionar o banco |
| `pnpm test:db:setup` | cria o database `projeto_prisma_test` (se não existir) e aplica as migrações nele — rodar uma vez antes de `pnpm test`, e de novo após criar migração nova |
| `pnpm test` | roda a suíte inteira uma vez (`vitest run`) |
| `pnpm test:watch` | roda a suíte em modo watch |
| `pnpm test:concurrency` | script manual à parte (não faz parte da suíte): dispara 50 requisições simultâneas contra um servidor **já rodando** (`pnpm dev`) — útil pra ver a garantia anti-double-booking se comportar contra um servidor de verdade, não só em teste isolado |

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
    clients/                 # busca de cliente por nome/telefone + cadastro de walk-in
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

Três camadas contra abuso no OTP — importa de verdade assim que existir WhatsApp de
verdade do outro lado, porque cada pedido passa a ser mensagem real saindo do número da
barbearia: cooldown de 30s por telefone entre pedidos (`OTP_RATE_LIMITED`), teto de 10
pedidos por telefone a cada 24h (`OTP_DAILY_LIMIT`), e limite de 5 requisições/10min por
IP em `/request` + 10/min em `/verify` (`RATE_LIMITED`) — mesma doutrina de duas camadas
do login de equipe abaixo (IP pega ataque rápido de uma origem, telefone pega o lento e
distribuído).

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

### Recuperação de senha de equipe ("esqueci minha senha")

`POST /auth/staff/forgot-password { email }` → sempre `202`, exista a conta ou não (não
dá pista de qual e-mail tem login de equipe — mesma postura do login não distinguir
"não existe" de "senha errada"). Se existir uma conta `ADMIN`/`BARBER` ativa com esse
e-mail, gera um token opaco de uso único (30min de validade, guardado só como hash em
`password_reset_tokens` — igual a refresh token e API key) e envia por e-mail via Resend;
um pedido novo invalida qualquer token anterior ainda não usado. Limite de 5
requisições/minuto por IP.

`POST /auth/staff/reset-password { token, newPassword }` → `204`. Token inválido,
expirado ou já usado vira `401 INVALID_RESET_TOKEN` (mesma mensagem pros três casos —
não dá pista de qual é). Consumir um token válido também **revoga todos os refresh
tokens ativos do usuário e limpa bloqueio de conta por tentativas erradas** — troca de
senha por "esqueci" é tratada como possível comprometimento, então derruba todas as
sessões abertas, igual à detecção de reuso de refresh token.

Cliente não usa senha (login é OTP por WhatsApp), então este fluxo é só para equipe.
Sem `ADMIN_PANEL_URL` configurada, o e-mail mostra o token cru em vez de um link — ainda
não existe um painel administrativo com URL própria pra apontar (sistema é API-first).

### API key para máquinas (n8n e outros consumidores server-to-server)

Terceira via de autenticação, separada de cliente e equipe — pensada pra quem não é um
humano logando (`docs/ARQUITETURA.md` §02). `POST /api-keys` (`ADMIN`) gera uma chave
`sk_...` com um ou mais escopos; **a chave completa só aparece nessa resposta, uma vez**
— o banco guarda só o hash (`src/lib/tokens.ts`), igual à senha de equipe e ao refresh
token. Listagens mostram só `keyPrefix` (os 8 primeiros caracteres) para identificar
qual chave é qual.

Escopos hoje (`src/modules/apikeys/scopes.ts`), um por domínio, cada um com o mesmo
poder que um `ADMIN` teria naquela fatia da API — não existe versão mais estreita:

| Escopo                 | Cobre |
|-------------------------|-------|
| `events:read`            | `GET /events` — fallback de pull do outbox |
| `notifications:write`    | `PATCH /notifications/:id` — callback reportando entrega real |
| `appointments:read/write`| toda a família `/appointments/*` — criar, listar, ver e tocar o ciclo de vida |
| `barbers:read/write`     | grade, folga e agenda de qualquer barbeiro (`/barbers/:id/schedule`, `/time-off`, `/agenda`) |
| `catalog:write`          | categorias, serviços, produtos (incl. imagens/estoque) e composição de pacotes |
| `financeiro:read/write`  | pedidos, relatórios, saldo de fidelidade e créditos de pacote de um cliente |

Duas exceções ficam de fora de propósito, mesmo com o escopo mais amplo de cada domínio:
criar/editar/remover a **identidade** de um barbeiro (`POST`/`PATCH`/`DELETE /barbers`,
que cria credencial de login) e vincular quais serviços ele faz
(`PUT /barbers/:id/services`) continuam só `ADMIN` — decisão de dono, não algo que uma
chave devesse fazer sozinha.

A maioria dessas rotas aceita **ou** uma sessão de equipe **ou** uma API key com o
escopo certo (`requireStaffOrApiKey`); as que já eram `ADMIN`-only (catálogo,
relatórios) usam `requireAdminOrApiKey` — a API key entra como alternativa, mas
`BARBER` continua de fora dos dois jeitos. Os dois decidem qual caminho seguir pelo
prefixo do token (`sk_...`), sem misturar os dois. Chave sem o escopo necessário vira
`403 INSUFFICIENT_SCOPE` (a chave é válida, só não pode fazer aquilo) — diferente de
`401`, que é chave ausente/inválida/revogada.

**Quem age nunca vem do corpo da requisição.** Os endpoints de ciclo de vida do
agendamento (`confirm`/`cancel`/`.../reschedule` etc.) tinham um campo `actorType` no
corpo que o próprio chamador declarava — um resquício de antes de existir autenticação
de equipe de verdade. Isso foi removido: `resolveActingIdentity`
(`src/plugins/auth.ts`) deriva `actorType`/`actorId` sempre da credencial autenticada —
`ADMIN`/`BARBER` de uma sessão de equipe, `API` (com o id da própria chave) de uma API
key. Um `BARBER` não pode mais se declarar `ADMIN` no payload, e uma API key não pode se
passar por `CLIENT` pra herdar as regras de prazo mais frouxas que valem só pra sessão
autenticada do portal (`/me/appointments/*`).

```bash
curl -X POST http://localhost:3000/api-keys \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"n8n produção","scopes":["events:read","notifications:write","appointments:write"]}'
# {"id":"...","keyPrefix":"sk_a1b2c3d4","key":"sk_a1b2c3d4...(guarde agora — não aparece de novo)"}

curl -X POST http://localhost:3000/appointments/apt_123/confirm \
  -H "Authorization: Bearer sk_a1b2c3d4..."
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

### Agendamentos (equipe ou máquina)

| | Rota | Descrição |
|---|---|---|
| 👤🤖 | `POST /appointments` | cria em nome de um cliente (escopo `appointments:write`) |
| 👤🤖 | `GET /appointments` | lista (filtros: barbeiro, cliente, status, período; escopo `appointments:read`) |
| 👤🤖 | `GET /appointments/:id` · `.../history` | detalhe e trilha de auditoria (`appointments:read`) |
| 👤🤖 | `POST .../confirm` · `.../check-in` · `.../complete` · `.../cancel` · `.../no-show` · `.../reschedule` | transições do ciclo de vida (`appointments:write`) |

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
| 🔒 | `POST` · `PATCH` · `DELETE /barbers/:id` · `PUT .../services` | cadastro e habilitação — sem alternativa de API key, de propósito |
| 👤🤖 | `GET`/`PUT /barbers/:id/schedule` · `POST .../time-off` · `GET .../agenda` | grade e agenda (escopado; `barbers:read`/`barbers:write`) |
| 🌐 | `GET /service-categories` · `GET /services` · `GET /services/:id` · `.../barbers` | vitrine |
| 🔒🤖 | `POST`/`PATCH` em ambos acima | catálogo e preço (`catalog:write`) |

### Financeiro, pacotes e fidelidade

| | Rota | Descrição |
|---|---|---|
| 👤 | `GET /clients?search=` · `POST /clients` | achar cliente por nome/telefone ou cadastrar um avulso (walk-in) |
| 🌐 | `GET /packages` · `GET /packages/:id` | catálogo de pacotes |
| 🔒🤖 | `POST`/`PATCH /packages` | definir pacote (`catalog:write`) |
| 👤🤖 | `POST`/`GET /clients/:id/packages` | vender/consultar pacote de um cliente (`financeiro:write`/`financeiro:read`) |
| 👤🤖 | `GET /clients/:id/loyalty` | saldo de pontos de um cliente (`financeiro:read`) |
| 🔒 | `GET /payments` | listagem financeira |
| 👤 | `GET /shop-settings` · 🔒 `PATCH` | número mágico do agendamento/fidelidade, incl. `loyaltyPointsExpirationDays` |

### Loja e avaliações

| | Rota | Descrição |
|---|---|---|
| 🌐 | `GET /products` · `GET /products/:id` | vitrine (nunca expõe custo) |
| 🔒🤖 | `POST`/`PATCH /products` · imagens · movimentações de estoque | gestão de inventário (`catalog:write`) |
| 👤🤖 | `POST`/`GET /orders` · `GET /orders/:id` | venda no balcão (`financeiro:write`/`financeiro:read`) |
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
| 🔒🤖 | `GET /reports/appointments` · `GET /reports/revenue` | dashboards (`financeiro:read`) |
| 🌐 | `GET /health` · `GET /health/db` | liveness/readiness |

## Integração com n8n

Todo evento de negócio (agendamento criado/confirmado/cancelado/concluído, notificação
pronta para envio, avaliação recebida) vai para uma tabela de outbox e é entregue por
webhook assinado (`X-Prisma-Signature`, HMAC-SHA256) a quem estiver cadastrado em
`POST /webhook-endpoints`. Retry com backoff exponencial (1min/5min/30min/2h/6h); endpoint
some desativado automaticamente após 5 entregas abandonadas seguidas. `GET /events?since=`
é o fallback de pull para quando o push não é viável.

**`notification.due`** é o evento que carrega WhatsApp de verdade: além de
`notificationId`/`clientId`/`channel`/`template`, o payload já vem com
`recipient: {phone, name}` e `message: {text}` — a API resolve destinatário e renderiza
o texto (fuso da loja, formatação pt-BR) no momento do despacho, igual já faz pro canal
de e-mail (`src/modules/notifications/whatsapp-dispatch.service.ts`, espelhando
`email-dispatch.service.ts`). Um workflow do n8n não precisa saber nada de regra de
negócio: só lê `recipient.phone` e manda `message.text` pro provedor de WhatsApp
configurado — nenhuma variável de ambiente da API muda quando o provedor muda.
`src/lib/phone.ts` normaliza o telefone recebido de volta (JID do WhatsApp, com/sem `+`,
com/sem o 9º dígito) pra bater com o que está salvo em `users.phone`.

Templates novos custam **zero** mudança de n8n — a prova disso é o cancelamento/remarcação
(`appointment_cancelled`/`appointment_rescheduled`, `src/modules/notifications/scheduler.ts`):
avisam o cliente quando a equipe cancela ou remarca (nunca quando é o próprio cliente que
faz — `appointmentEventPayload()` não carrega `actorType`, só o backend sabe quem agiu, e
avisar quem acabou de cancelar seria ruído), passam pelo mesmo `notification.due` de sempre,
e o workflow de saída não precisou de nenhum nó novo pra entregá-los.

**Resposta do cliente** (WF-2, `n8n/workflows/evolution-inbound-reply.json`): responder
"SIM" a um lembrete confirma o agendamento mais próximo automaticamente (`GET
/clients?phone=` + `GET /appointments?status=AGENDADO` + `POST /appointments/:id/confirm`,
escopo `clients:read` novo). "NÃO" não cancela nesta versão — só encaminha pra falar com a
equipe, porque `cancelAppointment` só aplica o prazo mínimo de cancelamento quando
`actorType === "CLIENT"`, e uma API key resolve como `"API"` (sem essa restrição).

**Setup completo (Evolution API self-hosted + os dois workflows prontos pra importar):**
ver [`n8n/README.md`](n8n/README.md). Resumo: `docker compose --profile whatsapp up -d`
sobe `n8n` + `evolution` num perfil próprio (não no `full`, pra não obrigar quem só quer
testar a imagem da API a subir uma stack de WhatsApp junto); `n8n/workflows/*.json` tem os
workflows prontos pra importar. Evolution é a escolha consciente de v1 — não oficial, sem
verificação de negócio, risco de banimento aceito; trocar por outro provedor depois é
mudar um nó HTTP no n8n, a API não muda uma linha.

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

## Testes automatizados

[Vitest](https://vitest.dev). Banco de teste isolado (`projeto_prisma_test`, mesmo
Postgres do `docker-compose.yml` — nunca toca no banco de dev), rodando as rotas via
`app.inject()` do Fastify (sem porta de verdade, contra Prisma/Postgres reais — nada de
mock no banco).

```bash
pnpm db:up            # se ainda não estiver rodando
pnpm test:db:setup     # cria o banco de teste + aplica migrações (uma vez)
pnpm test               # roda a suíte inteira
```

```
tests/
  setup/
    db.ts         # resetDatabase() — TRUNCATE ... CASCADE em tudo, chamado no beforeEach
    app.ts        # createTestApp() — uma instância nova do Fastify por teste
    fixtures.ts   # createAdmin, createBarberWithService, createClientUser, staffLogin...
    dates.ts      # nextWeekdayAt() — cai dentro da grade seg-sex dos fixtures
  unit/            # lógica pura, sem banco: álgebra de intervalos, hash de senha, tokens
  integration/     # contra o banco de teste: reserva/concorrência, ciclo de vida,
                    # autenticação de equipe (login/bloqueio/refresh/rate limit,
                    # recuperação de senha), escopo por barbeiro, API key,
                    # produtos/pedidos, pacotes/créditos, fidelidade, relatórios
```

`fileParallelism: false` no `vitest.config.ts` — todo teste de integração bate no MESMO
banco, então os arquivos rodam em sequência (evita um `resetDatabase()` de um arquivo
atropelar o teste de outro). Testes de login criam uma instância nova do app a cada
`it()` — o rate limiter guarda estado em memória por instância, então reusar o app entre
testes de tentativa de senha faria as tentativas de um contarem pro limite do próximo.

A cobertura é focada no que é mais arriscado errar, não em cobrir cada endpoint por
igual: a constraint de exclusão sob concorrência real (50 requisições simultâneas —
versão automatizada de `scripts/concurrency-test.ts`, que continua existindo à parte
como ferramenta de carga manual contra um servidor de verdade), a máquina de estados do
agendamento, autenticação/segurança (bloqueio de conta, rotação e detecção de reuso de
refresh token, rate limit, escopo por barbeiro, escopo de API key, recuperação de senha
por e-mail — token de uso único, invalidação do anterior, revogação de sessões ao trocar
a senha), e as travas
transacionais do lado financeiro — estoque com `SELECT ... FOR UPDATE` recusando venda
além do saldo (`products`/`orders`), crédito de pacote debitado com a mesma trava e
recusado quando expirado/fora de escopo/sem saldo (`packages`), pontos de fidelidade
ganhos e resgatados corretamente na conclusão de atendimento — inclusive o caso de
pagamento por pacote não gerar pontos novos (`loyalty`) — e os dashboards de agendamento
e financeiro batendo com os números reais gravados no período (`reports`).

**CI:** `.github/workflows/ci.yml` roda `typecheck` + `build` + a suíte inteira em todo
push/PR pra `master`, com um Postgres de serviço do próprio GitHub Actions (a imagem já
cria o database a partir de `POSTGRES_DB` — `migrate deploy` direto, sem precisar do
`scripts/setup-test-db.ts`, que existe só para o Postgres compartilhado do
`docker-compose.yml` local). Ainda não tem remoto configurado neste repositório, então
o workflow existe mas não rodou de verdade em nenhum push ainda — validei a sequência
inteira (`migrate deploy` → `typecheck` → `build` → `test`) rodando localmente contra um
banco recém-criado do zero, simulando um runner limpo.

## Manutenção em background

`server.ts` sobe dois loops via `setInterval`, sem depender de cron externo ou fila —
cada um só entra em ação a próxima vez que o servidor de fato estiver de pé:

- **A cada 5s** (`fireDueNotifications`, `fanOutPendingEvents`, `deliverPendingWebhooks`,
  `sweepAutoConfirm`) — entrega de notificação/webhook e auto-confirmação, onde atraso de
  segundos importa.
- **A cada 1h** (`expireLoyaltyPoints`, `cleanupExpiredRefreshTokens`) — manutenção de
  baixo volume, sem motivo pra rodar na cadência dos 5s.

**Expiração de pontos de fidelidade:** `loyaltyPointsExpirationDays` em `shop_settings`
(`null` por padrão = nunca expira; `PATCH /shop-settings` como `ADMIN` muda isso). O
prazo é carimbado no próprio lançamento de `EARN` no momento em que o ponto é ganho —
mudar a configuração depois nunca reescreve o vencimento de pontos já concedidos.
`expireLoyaltyPoints()` reconstrói em memória, por cliente, quanto sobrou de cada lote
ganho (um resgate consome o lote mais antigo primeiro, FIFO) e baixa só o que não foi
consumido de um lote vencido, gravando um lançamento `EXPIRE` que aponta pro `EARN`
original — nunca reescreve histórico. Idempotente: rodar de novo não duplica baixa,
porque o `EXPIRE` já criado zera aquele lote específico na reconstrução seguinte.

**Limpeza de refresh tokens:** `cleanupExpiredRefreshTokens()` apaga só linhas com
`expiresAt` já vencido — revogado ou não. Uma linha revogada mas **ainda dentro da
validade original** não é tocada: é o que sustenta a detecção de reuso (replay de um
token já trocado por um novo vira `REFRESH_TOKEN_REUSED` e derruba todas as sessões —
ver `src/lib/refresh-tokens.ts`); apagar cedo demais destruiria essa checagem sem
necessidade.

## Docker

A API tem um `Dockerfile` multi-stage (`build` compila e poda pra produção, `runtime` só
carrega o resultado — sem pnpm, sem devDependencies, sem código-fonte TypeScript na
imagem final):

```bash
docker build -t projeto-prisma-api .
```

Ou suba API + Postgres juntos via compose, atrás de um profile pra não interferir no
fluxo padrão de dev (`pnpm db:up` continua só o Postgres; a API local roda via `pnpm dev`
com hot-reload — o profile é pra testar a imagem publicada de ponta a ponta):

```bash
docker compose --profile full up -d --build
```

A imagem **não roda `prisma migrate deploy` no `CMD`** — aplicar migração é um passo
deliberadamente separado (`npx prisma migrate deploy` antes de subir uma nova versão),
pra evitar múltiplas réplicas correndo a migração em corrida entre si. `DATABASE_URL` e
`JWT_SECRET` continuam vindo do ambiente do container, nunca de um `.env` embutido na
imagem — mesmo `.dockerignore` que ignora `dist`/`node_modules`/`tests` também ignora
`.env*`.

Duas pegadinhas do Alpine + Prisma que valeram registro caso a imagem volte a quebrar:

- **pnpm 11 exige Node ≥ 22.13** (`packageManager` no `package.json`) — por isso a base é
  `node:22-alpine`, não `node:20-alpine`. Com Node 20, `corepack` baixa o pnpm certo mas
  ele falha ao subir (`ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`). O CI (`ci.yml`) usa o
  mesmo Node 22 pelo mesmo motivo.
- **Prisma não detecta a versão do OpenSSL dentro da imagem** (Alpine não traz o binário
  `openssl` por padrão) e cai no engine errado (`openssl-1.1.x`, que nem existe no Alpine
  3.24 — só `libssl.so.3`). Resolvido com `binaryTargets = ["native",
  "linux-musl-openssl-3.0.x"]` no `generator client` do `schema.prisma` (pra gerar o
  engine certo) **e** `apk add openssl` na imagem runtime (pra detecção em tempo de
  execução escolher esse engine em vez do genérico).

Validado de ponta a ponta: build limpo, container standalone contra o Postgres do
compose (`/health` e `/health/db` respondendo, `HEALTHCHECK` do próprio Docker reportando
`healthy`), execução como usuário não-root (`app`), e desligamento gracioso via
`dumb-init` + `SIGTERM` (processo encerra sozinho em ~1.6s, sem precisar de `SIGKILL` —
é o `close-with-grace` de `src/server.ts` funcionando dentro do container).

## Painel da equipe (frontend)

Em `frontend/` — projeto próprio (Vite + React + TypeScript + Tailwind), **não** faz
parte do workspace pnpm da API (tem seu próprio `pnpm-workspace.yaml` vazio, só pra se
isolar do da raiz). Consome a API como qualquer outro cliente HTTP, sem acesso direto ao
banco.

```bash
cd frontend
cp .env.example .env   # VITE_API_URL aponta pro backend local por padrão
pnpm install
pnpm dev                 # http://localhost:5173
```

Login de equipe (e-mail+senha), com sessão restaurada automaticamente após F5 via
refresh token guardado no `localStorage` — o access token fica só em memória.

Escopo v1 completo: **Agenda** (visão do dia, ciclo de vida completo do agendamento,
novo agendamento com busca/cadastro de cliente e escolha de horário), **Equipe e
catálogo** (colaboradores, grade semanal, folgas, serviços — ADMIN-only, escondido da
navegação pra `BARBER`) e **Financeiro** (pedidos, pacotes, fidelidade e — só pra
`ADMIN` — relatórios). `BARBER` vê a própria agenda automaticamente (a API já escopa) e
o menu esconde tudo que a API recusaria com 403.

Fora do escopo v1, de propósito: portal do cliente, tela de `shop-settings`, gestão de
API keys pela interface.

## O que ainda não existe

Levantamento honesto do que falta — nada aqui bloqueia o sistema funcionar, mas separa
"roda no meu Postgres local" de "pronto pra produção":

- **Sem revogação de sessão em massa** a pedido do usuário (só existe via detecção de
  reuso de refresh token).
