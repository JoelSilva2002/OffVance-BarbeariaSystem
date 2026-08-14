import { z } from "zod";

const DEV_JWT_SECRET = "dev-insecure-secret-troque-em-producao-0000";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  JWT_SECRET: z.string().min(16).default(DEV_JWT_SECRET),
});

export const env = envSchema.parse(process.env);

if (env.JWT_SECRET === DEV_JWT_SECRET && env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET precisa ser definido explicitamente em produção — não use o valor padrão de desenvolvimento.");
}
