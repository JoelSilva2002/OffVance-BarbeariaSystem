import { useQuery } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/AuthContext";
import { getMe } from "@/lib/api/me";

/**
 * Placeholder da Fase 3 — só telefone/e-mail (só leitura) e logout. O
 * formulário de edição (nome, aniversário, barbeiro preferido, notas) e as
 * subpáginas de Fidelidade/Pacotes chegam na Fase 6.
 */
export function ProfilePage() {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const { logout } = useAuth();

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-primary">Perfil</h1>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Nome</p>
            <p className="text-sm">{me?.fullName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Telefone</p>
            <p className="text-sm">{me?.user.phone}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">E-mail</p>
            <p className="text-sm">{me?.user.email ?? "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Button variant="outline" onClick={() => logout()}>
        <LogOut className="size-4" />
        Sair
      </Button>
    </div>
  );
}
