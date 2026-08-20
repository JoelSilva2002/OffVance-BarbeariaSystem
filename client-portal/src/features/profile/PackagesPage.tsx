import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listMyPackages } from "@/lib/api/packages";
import { formatDate, formatMoney } from "@/lib/format";

export function PackagesPage() {
  const { data, isLoading } = useQuery({ queryKey: ["me", "packages"], queryFn: listMyPackages });
  const packages = data?.packages ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Link to="/perfil" className="text-muted-foreground">
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-primary">Pacotes</h1>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : packages.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <p className="text-sm text-muted-foreground">Você ainda não tem nenhum pacote.</p>
          <p className="text-xs text-muted-foreground">Fale com a gente pra comprar um pacote.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {packages.map((clientPackage) => (
            <Card key={clientPackage.id}>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{clientPackage.package.name}</p>
                  <span className="font-[family-name:var(--font-mono)] text-sm">
                    {clientPackage.creditsRemaining}/{clientPackage.creditsTotal}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {clientPackage.isExpired
                    ? `Expirou em ${formatDate(clientPackage.expiresAt)}`
                    : `Válido até ${formatDate(clientPackage.expiresAt)}`}
                </p>
                <p className="text-xs text-muted-foreground">Comprado por {formatMoney(clientPackage.package.priceCents)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
