import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth/AuthContext";
import { OrdersTab } from "./OrdersTab";
import { PackagesTab } from "./PackagesTab";
import { LoyaltyTab } from "./LoyaltyTab";
import { ReportsTab } from "./ReportsTab";

export function FinanceiroPage() {
  const { session } = useAuth();
  const isAdmin = session?.role === "ADMIN";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-medium text-foreground">Financeiro</h1>

      <Tabs defaultValue="pedidos">
        <TabsList>
          <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
          <TabsTrigger value="pacotes">Pacotes</TabsTrigger>
          <TabsTrigger value="fidelidade">Fidelidade</TabsTrigger>
          {/* Relatórios é requireAdminOrApiKey na API — BARBER tomaria 403, então nem mostra o item aqui. */}
          {isAdmin && <TabsTrigger value="relatorios">Relatórios</TabsTrigger>}
        </TabsList>
        <TabsContent value="pedidos" className="mt-4">
          <OrdersTab />
        </TabsContent>
        <TabsContent value="pacotes" className="mt-4">
          <PackagesTab />
        </TabsContent>
        <TabsContent value="fidelidade" className="mt-4">
          <LoyaltyTab />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="relatorios" className="mt-4">
            <ReportsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
