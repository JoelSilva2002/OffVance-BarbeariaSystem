import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/AuthContext";
import type { ClientProfile } from "@/lib/api/auth";

/**
 * Placeholder da Fase 2 (autenticação) — só confirma que a sessão está
 * ativa e que o logout funciona. A Fase 3 substitui isto pelo shell de
 * navegação de verdade (bottom tab bar + Início).
 */
export function HomePlaceholderPage() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const client = queryClient.getQueryData<ClientProfile>(["me"]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-primary">
        Oi{client?.fullName ? `, ${client.fullName}` : ""}!
      </h1>
      <p className="text-muted-foreground">Sessão ativa. O resto do portal chega nas próximas fases.</p>
      <Button variant="outline" onClick={() => logout()}>
        Sair
      </Button>
    </div>
  );
}
