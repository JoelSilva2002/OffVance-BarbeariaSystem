import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createServiceCategory } from "@/lib/api/catalog";

export function CategoryFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const mutation = useMutation({
    mutationFn: createServiceCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-categories"] });
      toast.success("Categoria criada.");
      setName("");
      onOpenChange(false);
    },
    onError: () => toast.error("Não foi possível criar a categoria."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Nova categoria</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({ name });
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="categoryName">Nome</Label>
            <Input id="categoryName" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Criando…" : "Criar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
