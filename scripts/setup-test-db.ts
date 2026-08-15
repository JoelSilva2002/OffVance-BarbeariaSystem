/**
 * Cria o database de teste (se não existir) e aplica as migrações — rodar
 * uma vez antes de `pnpm test` (ou de novo depois de criar uma migração
 * nova). Idempotente.
 */
import { execSync } from "node:child_process";

const TEST_DATABASE_URL = "postgresql://prisma:prisma@localhost:5432/projeto_prisma_test?schema=public";

try {
  execSync(`docker exec prisma-postgres psql -U prisma -d postgres -c "CREATE DATABASE projeto_prisma_test"`, {
    stdio: "pipe",
  });
  console.log("Banco de teste criado.");
} catch (error) {
  const stderr = String((error as { stderr?: Buffer })?.stderr ?? "");
  if (stderr.includes("already exists")) {
    console.log("Banco de teste já existe.");
  } else {
    console.error(stderr || error);
    process.exit(1);
  }
}

execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
});

console.log("Migrações aplicadas no banco de teste.");
