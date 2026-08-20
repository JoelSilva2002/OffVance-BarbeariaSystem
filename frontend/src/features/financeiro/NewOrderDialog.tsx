import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ClientPicker } from "@/components/shared/ClientPicker";
import { formatMoney } from "@/lib/format";
import { ApiError } from "@/lib/api/errors";
import { listProducts } from "@/lib/api/products";
import { createOrder, type CreateOrderInput } from "@/lib/api/orders";
import type { ClientSummary } from "@/lib/api/clients";

export function NewOrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [client, setClient] = useState<ClientSummary | null>(null);
  const [skipClient, setSkipClient] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<CreateOrderInput["method"]>("CASH");

  const productsQuery = useQuery({ queryKey: ["products", "active"], queryFn: () => listProducts(true), enabled: open });

  useEffect(() => {
    if (!open) {
      setClient(null);
      setSkipClient(false);
      setQuantities({});
      setMethod("CASH");
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => {
      const items = Object.entries(quantities)
        .filter(([, qty]) => qty > 0)
        .map(([productId, qty]) => ({ productId, qty }));
      return createOrder({ clientId: client?.id, method, items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Pedido registrado.");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? (error.detail ?? "Não foi possível registrar o pedido.") : "Não foi possível registrar o pedido.");
    },
  });

  const products = productsQuery.data?.products ?? [];
  const totalCents = products.reduce((sum, p) => sum + (quantities[p.id] ?? 0) * p.salePriceCents, 0);
  const hasItems = Object.values(quantities).some((qty) => qty > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Novo pedido</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Cliente (opcional)</Label>
            {skipClient ? (
              <div className="flex items-center justify-between rounded-md border border-input px-3 py-2 text-sm text-muted-foreground">
                Venda sem cliente identificado
                <button type="button" className="text-primary hover:underline" onClick={() => setSkipClient(false)}>
                  Identificar
                </button>
              </div>
            ) : (
              <>
                <ClientPicker value={client} onChange={setClient} />
                {!client && (
                  <button type="button" className="self-start text-xs text-muted-foreground hover:underline" onClick={() => setSkipClient(true)}>
                    Pular — venda sem cliente
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Produtos</Label>
            {productsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : (
              <div className="flex flex-col divide-y divide-border rounded-md border border-border">
                {products.map((product) => (
                  <div key={product.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{product.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{formatMoney(product.salePriceCents)}</p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={product.stockQty}
                      value={quantities[product.id] ?? 0}
                      onChange={(e) => setQuantities((q) => ({ ...q, [product.id]: Number(e.target.value) }))}
                      className="w-16"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Forma de pagamento</Label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as CreateOrderInput["method"])}
              className="h-9 rounded-md border border-input bg-popover px-3 text-sm text-foreground"
            >
              <option value="CASH">Dinheiro</option>
              <option value="CREDIT_CARD">Cartão de crédito</option>
              <option value="DEBIT_CARD">Cartão de débito</option>
              <option value="PIX">Pix</option>
            </select>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-mono text-foreground">{formatMoney(totalCents)}</span>
          </div>

          <Button type="button" disabled={!hasItems || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Registrando…" : "Registrar pedido"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
