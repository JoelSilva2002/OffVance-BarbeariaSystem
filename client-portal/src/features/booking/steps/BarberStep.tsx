import { useQueries } from "@tanstack/react-query";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getServiceBarbers, type ServiceBarber } from "@/lib/api/catalog";
import type { BookingSelection } from "../types";

const ANY_BARBER = "any";

/** Interseção: só entram barbeiros que atendem TODOS os serviços escolhidos. */
function intersectBarbers(lists: ServiceBarber[][]): ServiceBarber[] {
  if (lists.length === 0) return [];
  const [first, ...rest] = lists;
  return first!.filter((barber) => rest.every((list) => list.some((b) => b.id === barber.id)));
}

export function BarberStep({
  selection,
  onChange,
  onNext,
  onBack,
}: {
  selection: BookingSelection;
  onChange: (next: Partial<BookingSelection>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const results = useQueries({
    queries: selection.serviceIds.map((serviceId) => ({
      queryKey: ["service-barbers", serviceId],
      queryFn: () => getServiceBarbers(serviceId),
    })),
  });

  const isLoading = results.some((r) => r.isLoading);
  const qualifiedBarbers = intersectBarbers(results.map((r) => r.data?.barbers ?? []));

  const selectedValue = selection.barberMode === "any" ? ANY_BARBER : (selection.barberId ?? "");

  function handleSelect(value: string) {
    if (value === ANY_BARBER) {
      onChange({ barberMode: "any", barberId: null });
    } else {
      onChange({ barberMode: "specific", barberId: value });
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-28">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-primary">Escolha o barbeiro</h1>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ) : qualifiedBarbers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum barbeiro atende essa combinação de serviços. Volte e ajuste sua escolha.
        </p>
      ) : (
        <RadioGroup value={selectedValue} onValueChange={handleSelect} className="gap-2">
          <label
            htmlFor="barber-any"
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-3"
          >
            <RadioGroupItem value={ANY_BARBER} id="barber-any" />
            <span className="text-sm font-medium">Qualquer barbeiro disponível</span>
          </label>

          {qualifiedBarbers.map((barber) => (
            <label
              key={barber.id}
              htmlFor={`barber-${barber.id}`}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-3"
            >
              <RadioGroupItem value={barber.id} id={`barber-${barber.id}`} />
              <Avatar className="size-8">
                <AvatarImage src={barber.photoUrl ?? undefined} alt={barber.displayName} />
                <AvatarFallback>{barber.displayName.charAt(0)}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{barber.displayName}</span>
            </label>
          ))}
        </RadioGroup>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card p-4 pb-safe">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <Button variant="outline" onClick={onBack}>
            Voltar
          </Button>
          <Button onClick={onNext} disabled={qualifiedBarbers.length === 0} className="flex-1">
            Continuar
          </Button>
        </div>
      </div>
    </div>
  );
}
