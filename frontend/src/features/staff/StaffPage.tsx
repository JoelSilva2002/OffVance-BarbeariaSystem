import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarbersTab } from "./BarbersTab";
import { CatalogTab } from "../catalog/CatalogTab";

export function StaffPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-medium text-foreground">Equipe e catálogo</h1>

      <Tabs defaultValue="barbeiros">
        <TabsList>
          <TabsTrigger value="barbeiros">Barbeiros</TabsTrigger>
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
        </TabsList>
        <TabsContent value="barbeiros" className="mt-4">
          <BarbersTab />
        </TabsContent>
        <TabsContent value="catalogo" className="mt-4">
          <CatalogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
