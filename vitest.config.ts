import { defineConfig } from "vitest/config";

// Banco de teste isolado — mesmo Postgres do docker-compose, database
// separado (nunca toca em projeto_prisma, o do dev). Ver `pnpm test:db:setup`.
const TEST_DATABASE_URL = "postgresql://prisma:prisma@localhost:5432/projeto_prisma_test?schema=public";

export default defineConfig({
  test: {
    // Sem isso, o glob padrão do vitest também varre frontend/ e
    // client-portal/ (cada um com seu próprio vitest.config.ts, alias @/ e
    // ambiente jsdom, nunca aplicados quando importados daqui) — rodar
    // `pnpm test` na raiz tentava executar os testes de frontend sem a
    // config deles e falhava.
    include: ["tests/**/*.test.ts"],
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: "test-jwt-secret-nao-usar-em-producao-0000",
      NODE_ENV: "test",
      // uma suíte de integração gera milhares de linhas de log de request —
      // sem isso, achar a falha de verdade no meio do ruído é um saco
      LOG_LEVEL: "silent",
    },
    // Todos os testes de integração batem no MESMO banco — rodar arquivos de
    // teste em paralelo faria um resetDatabase() de um arquivo atropelar o
    // teste de outro no meio da execução. Nesta escala, sequencial é rápido
    // o bastante e elimina a categoria inteira de flakiness.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
