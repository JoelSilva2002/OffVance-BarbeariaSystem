import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getLoyaltySummary } from "@/lib/api/loyalty";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const REASON_LABELS: Record<string, string> = {
  EARN: "Pontos ganhos",
  REDEEM: "Pontos resgatados",
  EXPIRE: "Pontos expirados",
  ADJUST: "Ajuste",
};

export function LoyaltyPage() {
  const { data, isLoading } = useQuery({ queryKey: ["me", "loyalty"], queryFn: getLoyaltySummary });

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Link to="/perfil" className="text-muted-foreground">
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-primary">Fidelidade</h1>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-1 py-6 text-center">
          <span className="font-[family-name:var(--font-display)] text-4xl text-primary">{data?.balance ?? "–"}</span>
          <span className="text-sm text-muted-foreground">pontos disponíveis</span>
        </CardContent>
      </Card>

      <h2 className="text-sm font-medium text-muted-foreground">Histórico</h2>
      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : (data?.entries.length ?? 0) === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma movimentação ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {data!.entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
              <div>
                <p className="text-sm font-medium">{REASON_LABELS[entry.reason] ?? entry.reason}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</p>
              </div>
              <span
                className={cn(
                  "font-[family-name:var(--font-mono)] text-sm font-medium",
                  entry.deltaPoints >= 0 ? "text-status-done" : "text-muted-foreground",
                )}
              >
                {entry.deltaPoints >= 0 ? "+" : ""}
                {entry.deltaPoints}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
