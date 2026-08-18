import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { DateTime } from "luxon";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { listOrders } from "@/lib/api/orders";
import { NewOrderDialog } from "./NewOrderDialog";

export function OrdersTab() {
  const [isNewOpen, setIsNewOpen] = useState(false);
  const ordersQuery = useQuery({ queryKey: ["orders"], queryFn: () => listOrders() });
  const orders = ordersQuery.data?.orders ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setIsNewOpen(true)}>
          <Plus className="size-4" />
          Novo pedido
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {ordersQuery.isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : orders.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum pedido ainda.</p>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
              <div className="w-32 shrink-0 font-mono text-xs text-muted-foreground">
                {DateTime.fromISO(order.createdAt).toFormat("dd/MM HH:mm")}
              </div>
              <div className="min-w-0 flex-1 truncate text-sm text-foreground">
                {order.items.map((item) => `${item.qty}× ${item.product.name}`).join(", ")}
              </div>
              <div className="w-24 shrink-0 text-right font-mono text-sm text-foreground">{formatMoney(order.totalCents)}</div>
            </div>
          ))
        )}
      </div>

      <NewOrderDialog open={isNewOpen} onOpenChange={setIsNewOpen} />
    </div>
  );
}
