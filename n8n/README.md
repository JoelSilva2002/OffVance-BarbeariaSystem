# WhatsApp via n8n + Evolution API

Como ligar mensagens de WhatsApp de verdade ao Projeto Prisma. A API nunca fala com o
WhatsApp — ela emite `notification.due` (com `recipient.phone` e `message.text` já
prontos, ver README §Integração com n8n) por webhook assinado; o n8n é só a camada de
transporte que entrega.

**Aviso honesto:** os workflows em `workflows/*.json` foram escritos à mão (não
exportados de uma instância n8n rodando de verdade — ver §Verificação abaixo pro porquê
disso importar). A estrutura e as conexões entre nós devem importar sem erro, mas alguns
detalhes de valor — em especial o nome exato do campo com o id da mensagem na resposta
do Evolution — são palpites razoáveis, não confirmados contra uma instância real. Abra
cada workflow no editor do n8n antes de ativar e ajuste o que precisar; os passos de
verificação abaixo dizem exatamente o que conferir.

## Subindo a stack

```bash
# na raiz do repo — preencha N8N_ENCRYPTION_KEY e EVOLUTION_API_KEY no .env primeiro
# (ver .env.example §WhatsApp)
docker compose --profile whatsapp up -d
```

Isso sobe `n8n` (porta 5678) e `evolution` (porta 8080), além do `postgres` de sempre. A
API roda no host via `pnpm dev` (padrão) — o n8n alcança em
`http://host.docker.internal:3000`. Pra rodar a API também containerizada, suba com
`--profile full --profile whatsapp` e ajuste `PRISMA_API_URL` pra `http://api:3000`.

## 1. Parear o WhatsApp no Evolution

```bash
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: $EVOLUTION_API_KEY" -H "Content-Type: application/json" \
  -d '{"instanceName":"barbearia","qrcode":true,"integration":"WHATSAPP-BAILEYS"}'
```

A resposta traz um QR code (base64) — abra no navegador ou decodifique e escaneie com o
WhatsApp do número que vai representar a barbearia (Aparelhos conectados → Conectar um
aparelho). Confirme que pareou:

```bash
curl http://localhost:8080/instance/connectionState/barbearia -H "apikey: $EVOLUTION_API_KEY"
# esperado: {"instance":{"state":"open"}}
```

**Faça isso antes de qualquer outra coisa** — é o único passo desta lista que não tem
como ser testado sem um WhatsApp de verdade.

## 2. Registrar o endpoint de webhook na API

```bash
ADMIN_TOKEN=$(curl -s -X POST http://localhost:3000/auth/staff/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"SEU_EMAIL_ADMIN","password":"SUA_SENHA"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")

curl -X POST http://localhost:3000/webhook-endpoints \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"url":"http://localhost:5678/webhook/prisma-notification-due","subscribedEvents":["notification.due"]}'
```

Isto é só pro WF-1 (saída). O WF-2 (`evolution-inbound-reply`, entrada) não usa `webhook-endpoints` —
o Evolution chama o n8n direto (`WEBHOOK_GLOBAL_URL` já configurado em `docker-compose.yml`, sem
passar pela API), então não há nada pra registrar aqui.

**Guarde o `secret` da resposta agora — ele não aparece de novo.** É o
`PRISMA_WEBHOOK_SECRET` do `.env`. Assinar **só** em `notification.due` é proposital:
confirmar um agendamento via WF-2 emite `appointment.confirmed`, que voltaria como ruído
pro mesmo endpoint se ele estivesse inscrito nesse tipo também.

Se a API rodar containerizada (`--profile full`), a URL vira `http://n8n:5678/webhook/...`
— é config que mora numa linha do banco (`webhook_endpoints.url`), não em variável de
ambiente; trocar de cenário (API no host ↔ API em container) é um
`PATCH /webhook-endpoints/:id`.

## 3. Importar e configurar os workflows no n8n

1. Abra `http://localhost:5678`, crie a conta de admin do n8n (primeiro acesso).
2. **Workflows → Import from File** → `workflows/prisma-notification-due.json` (WF-1, saída)
   e `workflows/evolution-inbound-reply.json` (WF-2, entrada — resposta do cliente).
3. Os dois usam `$env.PRISMA_API_URL`, `$env.PRISMA_API_KEY`, `$env.EVOLUTION_URL`,
   `$env.EVOLUTION_API_KEY`; WF-1 também usa `$env.PRISMA_WEBHOOK_SECRET` e WF-2 também usa
   `$env.EVOLUTION_INSTANCE`. Todos já vêm do `docker-compose.yml` (seção `n8n.environment`),
   então não precisa recriar nada manualmente, só conferir que o `.env` da raiz está
   preenchido antes de subir a stack.
4. `PRISMA_API_KEY` precisa ser uma API key de verdade, criada uma vez, com os quatro
   escopos que os dois workflows juntos usam (ver `credentials/README.md` pro comando
   completo):
   ```bash
   curl -X POST http://localhost:3000/api-keys -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"name":"n8n","scopes":["notifications:write","clients:read","appointments:read","appointments:write"]}'
   ```
   Guarde o `key` (só aparece uma vez) em `PRISMA_API_KEY` no `.env`.
5. No WF-1, abra o nó **"Recebe evento"** e confirme que **Raw Body está marcado** em
   Options — é o passo mais fácil de esquecer e o que mais silenciosamente quebra tudo (a
   assinatura deixa de bater e toda entrega vira 401, sem nenhuma mensagem de erro óbvia
   apontando pra causa). O WF-2 não verifica assinatura (ver sticky note dentro do próprio
   workflow pro porquê), então não tem esse passo.
6. **Ative os dois workflows** (toggle no canto superior direito de cada um).

## Verificação

Automatizado (não toca em WhatsApp de propósito): `tests/integration/outbox-delivery.test.ts`
e `tests/integration/whatsapp-notification.test.ts` (WF-1); `tests/integration/clients.test.ts`
e `tests/integration/api-key-scope-expansion.test.ts` (`?phone=`, escopo `clients:read` — o que
WF-2 chama pra achar o cliente); `tests/integration/appointment-lifecycle.test.ts` (o 409
`INVALID_TRANSITION` que WF-2 precisa tratar sem virar erro). Tudo já roda na suíte da API.

Só dá pra verificar à mão, nesta ordem:

1. **O formato do JID do seu número real.** Mande uma mensagem de teste pro número da
   barbearia a partir do seu celular pessoal e confira `curl
   http://localhost:8080/instance/fetchInstances -H "apikey: $EVOLUTION_API_KEY"` ou o
   log de execução de um workflow de teste — compare o JID recebido
   (`5511999998888@s.whatsapp.net` ou sem o 9º dígito?) com o que
   `src/lib/phone.ts#phoneLookupVariants` gera pro mesmo número.
2. **Entrega real (WF-1).** Force uma notificação a vencer (`UPDATE notifications SET
   scheduled_for = now() WHERE ...`), espere o loop de 5s do backend
   (`fireDueNotifications` → `notification.due`), confirme no n8n (Executions) que o
   workflow rodou e que a mensagem chegou no celular — acento e emoji (`ç`, `ã`, `✂️`)
   incluídos.
3. **O timeout de 10s sob latência real (WF-1).** Depois do envio, confira via psql:
   ```sql
   select status, attempts from webhook_deliveries order by created_at desc limit 1;
   ```
   Espera-se `SUCCEEDED` com `attempts = 1`. Se vier `attempts > 1`, o "responde 200
   antes de chamar o Evolution" não está funcionando como deveria e o cliente pode estar
   recebendo a mensagem duas vezes.
4. **O campo do id da mensagem (WF-1).** Abra a execução do nó "Envia via Evolution" no n8n
   e veja o corpo de resposta de verdade — se não for `key.id`, ajuste o nó "Reporta
   sucesso" (é exatamente o palpite não confirmado citado no topo deste arquivo).
5. **O payload real do `messages.upsert` (WF-2).** Responda "SIM" a um lembrete de verdade
   (ou mande qualquer texto pro número da barbearia) e abra a execução do nó "Extrai e
   classifica" — confirme que `data.key.remoteJid`, `data.message.conversation` e
   `data.messageType` existem com esses nomes exatos (pesquisados, não confirmados contra
   uma instância real — ver sticky note do workflow). Ajuste o Code node se algo divergir.
6. **O ciclo completo de confirmação (WF-2).** Responda "SIM", confira que a mensagem "✅"
   chegou com a data/hora certa, e confira no psql: `select status from
   appointment_status_history where appointment_id = '...' order by created_at desc
   limit 1;` deve trazer `actorType = 'API'`.
7. **O 409 na prática.** Confirme um agendamento pelo painel e responda "SIM" ao lembrete
   dele em seguida — deve chegar "Seu horário já estava confirmado 👍", não uma mensagem de
   erro genérica nem silêncio.
8. **Entrada não reconhecida não quebra nada.** Mande uma figurinha, um áudio, ou qualquer
   texto fora da régua de intenção (ex.: "oi, vocês abrem sábado?") — confira que a execução
   aparece como sucesso no n8n (branch "ignorado") e que nenhuma mensagem é respondida.

## `credentials/`

Ver `credentials/README.md` — nomes e escopos esperados, nunca os valores.
