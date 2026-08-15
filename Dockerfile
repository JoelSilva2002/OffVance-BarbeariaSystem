# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# -----------------------------------------------------------------------------
# build — instala TUDO (inclusive devDependencies: precisa do tsc e do Prisma
# CLI), gera o Prisma Client, compila pra dist/, e só então poda pra produção.
# `pnpm prune --prod` remove devDependencies no lugar, sem mexer no que o
# Prisma Client já gerou dentro de @prisma/client (que é dependency, não
# devDependency) — evita o problema clássico de copiar node_modules do pnpm
# entre estágios (é tudo link simbólico pro virtual store; só é seguro copiar
# a árvore inteira de uma vez, nunca subpastas escolhidas a dedo).
# -----------------------------------------------------------------------------
FROM base AS build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src

RUN pnpm prisma:generate
RUN pnpm build
RUN pnpm prune --prod

# -----------------------------------------------------------------------------
# runtime — imagem final enxuta. Sem pnpm, sem devDependencies, sem código
# fonte TypeScript — só dist/, node_modules de produção, e o necessário do
# Prisma pra quem quiser rodar `prisma migrate deploy` a partir da imagem.
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runtime

# openssl é o que permite ao Prisma Client detectar a versão do OpenSSL em
# tempo de execução e escolher o engine certo (linux-musl-openssl-3.0.x); sem
# ele a detecção falha e ele tenta carregar o engine genérico, que não linka.
RUN apk add --no-cache dumb-init openssl \
  && addgroup -S app && adduser -S app -G app

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

USER app
EXPOSE 3000

# Node 20 tem fetch global — sem precisar instalar curl/wget na imagem alpine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# dumb-init como PID 1 — encaminha SIGTERM de verdade pro processo Node, que
# é o que close-with-grace (src/server.ts) precisa pra desligar graciosamente
# em vez de ser morto na marra quando o orquestrador pede shutdown.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
