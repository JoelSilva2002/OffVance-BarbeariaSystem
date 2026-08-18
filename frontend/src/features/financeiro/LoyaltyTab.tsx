import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { ClientPicker } from "@/components/shared/ClientPicker";
import { Label } from "@/components/ui/label";
import { getClientLoyalty, type LoyaltyEntry } from "@/lib/api/loyalty";
import type { ClientSummary } from "@/lib/api/clients";

const REASON_LABELS: Record<LoyaltyEntry["reason"], string> = {
  EARN: "Ganho",
  REDEEM: "Resgate",
  ADJUST: "Ajuste",
  EXPIRE: "Expirado",
};

export function LoyaltyTab() {
  const [client, setClient] = useState<ClientSummary | null>(null);

  const loyaltyQuery = useQuery({
    queryKey: ["clients", client?.id, "loyalty"],
    queryFn: () => getClientLoyalty(client!.id),
    enabled: Boolean(client),
  });

  return (
    <div className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Cliente</Label>
        <ClientPicker value={client} onChange={setClient} />
      </div>

      {client && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-sm text-muted-foreground">Saldo de pontos</p>
            <p className="font-display text-3xl text-foreground">{loyaltyQuery.data?.balance ?? "…"}</p>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {loyaltyQuery.isLoading ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Carregando…</p>
            ) : loyaltyQuery.data?.entries.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sem lançamentos ainda.</p>
            ) : (
              loyaltyQuery.data?.entries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm last:border-b-0">
                  <div>
                    <p className="text-foreground">{REASON_LABELS[entry.reason]}</p>
                    <p className="text-xs text-muted-foreground">{DateTime.fromISO(entry.createdAt).toFormat("dd/MM/yyyy")}</p>
                  </div>
                  <span className={`font-mono ${entry.deltaPoints >= 0 ? "text-status-confirmed" : "text-muted-foreground"}`}>
                    {entry.deltaPoints >= 0 ? "+" : ""}
                    {entry.deltaPoints}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
