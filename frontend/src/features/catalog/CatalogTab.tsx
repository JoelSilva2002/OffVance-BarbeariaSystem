import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { listServiceCategories, listServices, type Service } from "@/lib/api/catalog";
import { CategoryFormDialog } from "./CategoryFormDialog";
import { ServiceFormDialog } from "./ServiceFormDialog";

export function CatalogTab() {
  const [isCategoryFormOpen, setIsCategoryFormOpen] = useState(false);
  const [serviceDialog, setServiceDialog] = useState<{ open: boolean; service: Service | null }>({ open: false, service: null });

  const categoriesQuery = useQuery({ queryKey: ["service-categories"], queryFn: listServiceCategories });
  const servicesQuery = useQuery({ queryKey: ["services", "all"], queryFn: () => listServices() });

  const categories = categoriesQuery.data?.categories ?? [];
  const services = servicesQuery.data?.services ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setIsCategoryFormOpen(true)}>
          <Plus className="size-4" />
          Nova categoria
        </Button>
        <Button disabled={categories.length === 0} onClick={() => setServiceDialog({ open: true, service: null })}>
          <Plus className="size-4" />
          Novo serviço
        </Button>
      </div>

      {categories.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Cadastre uma categoria pra começar.</p>
      ) : (
        categories.map((category) => {
          const categoryServices = services.filter((s) => s.categoryId === category.id);
          return (
            <div key={category.id} className="overflow-hidden rounded-lg border border-border bg-card">
              <p className="border-b border-border px-4 py-2 text-sm font-medium text-foreground">{category.name}</p>
              {categoryServices.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">Nenhum serviço nesta categoria.</p>
              ) : (
                categoryServices.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => setServiceDialog({ open: true, service })}
                    className="flex w-full items-center justify-between border-b border-border px-4 py-2.5 text-left last:border-b-0 hover:bg-accent"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm text-foreground">{service.name}</span>
                      <span className="text-xs text-muted-foreground">{service.durationMin}min</span>
                      {!service.active && <Badge variant="outline">Inativo</Badge>}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{formatMoney(service.priceCents)}</span>
                  </button>
                ))
              )}
            </div>
          );
        })
      )}

      <CategoryFormDialog open={isCategoryFormOpen} onOpenChange={setIsCategoryFormOpen} />
      <ServiceFormDialog
        open={serviceDialog.open}
        onOpenChange={(open) => setServiceDialog({ open, service: open ? serviceDialog.service : null })}
        categories={categories}
        service={serviceDialog.service}
      />
    </div>
  );
}
