# Credenciais esperadas pelos workflows

Nenhum segredo mora neste diretório nem em `../workflows/*.json` — os workflows exportados
carregam só *referência* de credencial (`{id, name}`), nunca o valor. Este arquivo existe
pra documentar o que cada workflow espera encontrar, não pra guardar nada sensível.

O desenho atual (v1) não usa o cofre de credenciais do n8n — tudo é lido via
`{{$env.VARIAVEL}}`, resolvido pelas variáveis de ambiente do próprio container `n8n`
(ver `docker-compose.yml`, seção `n8n.environment`, preenchidas a partir do `.env` da
raiz do repo). Mais simples de reproduzir entre máquinas do que recriar credenciais
manualmente na UI toda vez, ao custo de "quem tem acesso ao container tem acesso aos
segredos" — aceitável nesta escala (um único ambiente, sem múltiplos operadores).

| Variável | De onde vem | Usada por |
|---|---|---|
| `PRISMA_WEBHOOK_SECRET` | `secret` devolvido por `POST /webhook-endpoints` (só aparece uma vez) | `prisma-notification-due` — verificação de HMAC |
| `PRISMA_API_KEY` | `key` devolvido por `POST /api-keys` com escopos `notifications:write`, `clients:read`, `appointments:read`, `appointments:write` — ver comando abaixo | `prisma-notification-due` (reportar entrega) e `evolution-inbound-reply` (achar cliente/agendamento e confirmar) |
| `PRISMA_API_URL` | `.env` — `http://host.docker.internal:3000` (API no host) ou `http://api:3000` (API containerizada) | todos os workflows |
| `EVOLUTION_URL` | fixo em `docker-compose.yml` — `http://evolution:8080` | ambos os workflows |
| `EVOLUTION_API_KEY` | `.env` — mesma string de `AUTHENTICATION_API_KEY` do serviço `evolution` | ambos os workflows |
| `EVOLUTION_INSTANCE` | `.env` — nome dado em `POST /instance/create` (padrão `barbearia`) | `prisma-notification-due` |

`evolution-inbound-reply` não lê `PRISMA_WEBHOOK_SECRET` nem verifica assinatura — o Evolution chama o n8n direto na rede interna do Docker (`WEBHOOK_GLOBAL_URL` em `docker-compose.yml`), não é um endpoint exposto publicamente pela API; a fronteira de confiança é a própria rede do compose.

Uma única chave cobrindo os quatro escopos (em vez de uma por workflow) é a escolha de v1 — mais simples de reproduzir, ao custo de "se vazar, vaza tudo que o n8n pode fazer". Escala aceitável enquanto for um único n8n confiável:

```bash
curl -X POST http://localhost:3000/api-keys -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"n8n","scopes":["notifications:write","clients:read","appointments:read","appointments:write"]}'
```

Se um dia isso crescer pra várias pessoas mexendo no mesmo n8n, migrar pro cofre de
credenciais nativo (HTTP Header Auth pro Evolution, Header Auth pra API) é a evolução
natural — troca `{{$env.X}}` por uma credencial nomeada nos nós HTTP Request, sem mudar
nada do lado da API.
