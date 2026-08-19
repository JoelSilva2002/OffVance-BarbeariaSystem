import { useQuery } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listServiceCategories, listServices } from "@/lib/api/catalog";
import { formatMoney } from "@/lib/format";
import type { BookingSelection } from "../types";

export function ServiceStep({
  selection,
  onChange,
  onNext,
}: {
  selection: BookingSelection;
  onChange: (next: Partial<BookingSelection>) => void;
  onNext: () => void;
}) {
  const { data: categoriesData, isLoading: isLoadingCategories } = useQuery({
    queryKey: ["service-categories"],
    queryFn: listServiceCategories,
  });
  const { data: servicesData, isLoading: isLoadingServices } = useQuery({
    queryKey: ["services"],
    queryFn: listServices,
  });

  const isLoading = isLoadingCategories || isLoadingServices;
  const categories = categoriesData?.categories ?? [];
  const services = servicesData?.services ?? [];

  function toggleService(serviceId: string) {
    const next = selection.serviceIds.includes(serviceId)
      ? selection.serviceIds.filter((id) => id !== serviceId)
      : [...selection.serviceIds, serviceId];
    onChange({ serviceIds: next });
  }

  const selectedServices = services.filter((s) => selection.serviceIds.includes(s.id));
  const totalCents = selectedServices.reduce((sum, s) => sum + s.priceCents, 0);
  const totalMin = selectedServices.reduce((sum, s) => sum + s.durationMin, 0);

  return (
    <div className="flex flex-col gap-4 p-4 pb-28">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-primary">Escolha o serviço</h1>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : (
        categories.map((category) => {
          const categoryServices = services.filter((s) => s.categoryId === category.id);
          if (categoryServices.length === 0) return null;
          return (
            <div key={category.id} className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">{category.name}</h2>
              {categoryServices.map((service) => (
                <label
                  key={service.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <Checkbox
                    checked={selection.serviceIds.includes(service.id)}
                    onCheckedChange={() => toggleService(service.id)}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{service.name}</p>
                    <p className="text-xs text-muted-foreground">{service.durationMin} min</p>
                  </div>
                  <span className="font-[family-name:var(--font-mono)] text-sm">{formatMoney(service.priceCents)}</span>
                </label>
              ))}
            </div>
          );
        })
      )}

      {selectedServices.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card p-4 pb-safe">
          <div className="mx-auto flex max-w-md items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{formatMoney(totalCents)}</p>
              <p className="text-xs text-muted-foreground">{totalMin} min</p>
            </div>
            <Button onClick={onNext}>Continuar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
