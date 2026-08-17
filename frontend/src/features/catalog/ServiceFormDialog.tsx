import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createService, updateService, type Service, type ServiceCategory } from "@/lib/api/catalog";

export function ServiceFormDialog({
  open,
  onOpenChange,
  categories,
  service,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ServiceCategory[];
  service?: Service | null;
}) {
  const queryClient = useQueryClient();
  const isEditing = Boolean(service);

  const [categoryId, setCategoryId] = useState(service?.categoryId ?? categories[0]?.id ?? "");
  const [name, setName] = useState(service?.name ?? "");
  const [durationMin, setDurationMin] = useState(String(service?.durationMin ?? 30));
  const [priceCents, setPriceCents] = useState(String(service ? service.priceCents / 100 : ""));
  const [active, setActive] = useState(service?.active ?? true);

  // O diálogo (Radix) fica montado o tempo todo, só alterna `open` — os
  // useState acima só rodam o inicializador uma vez, então sem isto o
  // formulário reabriria sempre com os valores da primeira vez que montou
  // (inclusive categoryId="" se `categories` ainda estava vazio nesse
  // momento, por causa da query ainda não ter resolvido).
  useEffect(() => {
    if (!open) return;
    setCategoryId(service?.categoryId ?? categories[0]?.id ?? "");
    setName(service?.name ?? "");
    setDurationMin(String(service?.durationMin ?? 30));
    setPriceCents(String(service ? service.priceCents / 100 : ""));
    setActive(service?.active ?? true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, service]);

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        categoryId,
        name,
        durationMin: Number(durationMin),
        priceCents: Math.round(Number(priceCents) * 100),
        active,
      };
      return service ? updateService(service.id, body) : createService(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      toast.success(isEditing ? "Serviço atualizado." : "Serviço criado.");
      onOpenChange(false);
    },
    onError: () => toast.error("Não foi possível salvar."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">{isEditing ? "Editar serviço" : "Novo serviço"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label>Categoria</Label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="serviceName">Nome</Label>
            <Input id="serviceName" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="durationMin">Duração (min)</Label>
              <Input id="durationMin" type="number" min={5} required value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="priceCents">Preço (R$)</Label>
              <Input id="priceCents" type="number" min={0} step="0.01" required value={priceCents} onChange={(e) => setPriceCents(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary" />
            Ativo
          </label>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
