import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listBarbers, type Barber } from "@/lib/api/barbers";
import { BarberFormDialog } from "./BarberFormDialog";
import { BarberDetailDialog } from "./BarberDetailDialog";

export function BarbersTab() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);

  const barbersQuery = useQuery({ queryKey: ["barbers"], queryFn: () => listBarbers() });
  const barbers = barbersQuery.data?.barbers ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="size-4" />
          Novo barbeiro
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {barbersQuery.isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : barbers.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum barbeiro cadastrado.</p>
        ) : (
          barbers.map((barber) => (
            <button
              key={barber.id}
              type="button"
              onClick={() => setSelectedBarber(barber)}
              className="flex w-full items-center justify-between border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-accent"
            >
              <span className="text-sm font-medium text-foreground">{barber.displayName}</span>
              <Badge variant={barber.status === "ACTIVE" ? "secondary" : "outline"}>
                {barber.status === "ACTIVE" ? "Ativo" : "Inativo"}
              </Badge>
            </button>
          ))
        )}
      </div>

      <BarberFormDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      {selectedBarber && (
        <BarberDetailDialog barberId={selectedBarber.id} open onOpenChange={(open) => !open && setSelectedBarber(null)} />
      )}
    </div>
  );
}
