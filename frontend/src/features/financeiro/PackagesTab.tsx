import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, ShoppingCart } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { listPackages, type Package } from "@/lib/api/packages";
import { PackageFormDialog } from "./PackageFormDialog";
import { SellPackageDialog } from "./SellPackageDialog";

export function PackagesTab() {
  const { session } = useAuth();
  const isAdmin = session?.role === "ADMIN";

  const [editingPackage, setEditingPackage] = useState<Package | null | undefined>(undefined);
  const [isSellOpen, setIsSellOpen] = useState(false);

  const packagesQuery = useQuery({ queryKey: ["packages"], queryFn: () => listPackages() });
  const packages = packagesQuery.data?.packages ?? [];
  const activePackages = packages.filter((p) => p.active);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={activePackages.length === 0} onClick={() => setIsSellOpen(true)}>
          <ShoppingCart className="size-4" />
          Vender pacote
        </Button>
        {isAdmin && (
          <Button onClick={() => setEditingPackage(null)}>
            <Plus className="size-4" />
            Novo pacote
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {packagesQuery.isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : packages.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum pacote cadastrado.</p>
        ) : (
          packages.map((pkg) => (
            <button
              key={pkg.id}
              type="button"
              disabled={!isAdmin}
              onClick={() => isAdmin && setEditingPackage(pkg)}
              className="flex w-full items-center justify-between gap-4 border-b border-border px-4 py-3 text-left last:border-b-0 disabled:cursor-default hover:enabled:bg-accent"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{pkg.name}</p>
                <p className="text-xs text-muted-foreground">{pkg.creditsQty} créditos · {pkg.validityDays} dias</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-foreground">{formatMoney(pkg.priceCents)}</span>
                {!pkg.active && <span className="text-xs text-muted-foreground">Inativo</span>}
              </div>
            </button>
          ))
        )}
      </div>

      {isAdmin && (
        <PackageFormDialog
          open={editingPackage !== undefined}
          onOpenChange={(open) => !open && setEditingPackage(undefined)}
          pkg={editingPackage}
        />
      )}
      <SellPackageDialog packages={activePackages} open={isSellOpen} onOpenChange={setIsSellOpen} />
    </div>
  );
}
