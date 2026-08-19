import { Button } from "@/components/ui/button";

/**
 * Placeholder da Fase 1 (scaffold) — só confirma que o tema/tokens estão
 * aplicados corretamente antes de entrar roteamento, auth e as telas de
 * verdade nas fases seguintes.
 */
export function App() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-primary">Prisma</h1>
      <p className="text-muted-foreground">Portal do cliente — em construção.</p>
      <Button>Entrar</Button>
    </div>
  );
}
