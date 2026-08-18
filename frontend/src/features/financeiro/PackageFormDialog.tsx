import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createPackage, updatePackage, type Package } from "@/lib/api/packages";

export function PackageFormDialog({
  open,
  onOpenChange,
  pkg,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pkg?: Package | null;
}) {
  const queryClient = useQueryClient();
  const isEditing = Boolean(pkg);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceCents, setPriceCents] = useState("");
  const [creditsQty, setCreditsQty] = useState("");
  const [validityDays, setValidityDays] = useState("90");
  const [active, setActive] = useState(true);

  // Diálogo fica montado o tempo todo (só alterna `open`) — resincroniza
  // os campos toda vez que abre, senão reabrir pra editar outro pacote
  // mostraria os valores do primeiro que foi editado.
  useEffect(() => {
    if (!open) return;
    setName(pkg?.name ?? "");
    setDescription(pkg?.description ?? "");
    setPriceCents(pkg ? String(pkg.priceCents / 100) : "");
    setCreditsQty(pkg ? String(pkg.creditsQty) : "");
    setValidityDays(pkg ? String(pkg.validityDays) : "90");
    setActive(pkg?.active ?? true);
  }, [open, pkg]);

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        name,
        description: description || undefined,
        priceCents: Math.round(Number(priceCents) * 100),
        creditsQty: Number(creditsQty),
        validityDays: Number(validityDays),
        active,
      };
      return pkg ? updatePackage(pkg.id, body) : createPackage(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      toast.success(isEditing ? "Pacote atualizado." : "Pacote criado.");
      onOpenChange(false);
    },
    onError: () => toast.error("Não foi possível salvar."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">{isEditing ? "Editar pacote" : "Novo pacote"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pkgName">Nome</Label>
            <Input id="pkgName" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pkgDescription">Descrição (opcional)</Label>
            <Textarea id="pkgDescription" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="pkgPrice">Preço (R$)</Label>
              <Input id="pkgPrice" type="number" min={0} step="0.01" required value={priceCents} onChange={(e) => setPriceCents(e.target.value)} />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="pkgCredits">Créditos</Label>
              <Input id="pkgCredits" type="number" min={1} required value={creditsQty} onChange={(e) => setCreditsQty(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pkgValidity">Validade (dias)</Label>
            <Input id="pkgValidity" type="number" min={1} required value={validityDays} onChange={(e) => setValidityDays(e.target.value)} />
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
