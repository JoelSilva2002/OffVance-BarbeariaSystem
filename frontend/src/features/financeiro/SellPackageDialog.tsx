import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ClientPicker } from "@/components/shared/ClientPicker";
import { formatMoney } from "@/lib/format";
import { ApiError } from "@/lib/api/errors";
import { purchasePackage, type Package } from "@/lib/api/packages";
import type { ClientSummary } from "@/lib/api/clients";

export function SellPackageDialog({
  packages,
  open,
  onOpenChange,
}: {
  packages: Package[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [client, setClient] = useState<ClientSummary | null>(null);
  const [packageId, setPackageId] = useState(packages[0]?.id ?? "");
  const [method, setMethod] = useState<"CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "PIX">("CASH");

  useEffect(() => {
    if (!open) {
      setClient(null);
      setMethod("CASH");
    } else {
      setPackageId(packages[0]?.id ?? "");
    }
  }, [open, packages]);

  const mutation = useMutation({
    mutationFn: () => purchasePackage(client!.id, packageId, method),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Pacote vendido.");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? (error.detail ?? "Não foi possível vender o pacote.") : "Não foi possível vender o pacote.");
    },
  });

  const selectedPackage = packages.find((p) => p.id === packageId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Vender pacote</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Cliente</Label>
            <ClientPicker value={client} onChange={setClient} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Pacote</Label>
            <select
              value={packageId}
              onChange={(e) => setPackageId(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
            >
              {packages.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name} — {formatMoney(pkg.priceCents)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Forma de pagamento</Label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
            >
              <option value="CASH">Dinheiro</option>
              <option value="CREDIT_CARD">Cartão de crédito</option>
              <option value="DEBIT_CARD">Cartão de débito</option>
              <option value="PIX">Pix</option>
            </select>
          </div>

          <Button type="button" disabled={!client || !selectedPackage || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Vendendo…" : "Vender"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
