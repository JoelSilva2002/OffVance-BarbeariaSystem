import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/errors";
import { createBarber } from "@/lib/api/barbers";

export function BarberFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const mutation = useMutation({
    mutationFn: createBarber,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barbers"] });
      toast.success("Barbeiro cadastrado.");
      reset();
      onOpenChange(false);
    },
  });

  function reset() {
    setDisplayName("");
    setPhone("");
    setEmail("");
  }

  const errorMessage =
    mutation.error instanceof ApiError
      ? mutation.error.title === "PHONE_TAKEN"
        ? "Já existe alguém com esse telefone."
        : mutation.error.title === "EMAIL_TAKEN"
          ? "Já existe alguém com esse e-mail."
          : mutation.error.title === "ALREADY_A_BARBER"
            ? "Já existe um barbeiro com esse telefone."
            : "Não foi possível cadastrar."
      : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Novo barbeiro</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({ displayName, phone, email: email || undefined });
          }}
          className="flex flex-col gap-4"
        >
          {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="displayName">Nome</Label>
            <Input id="displayName" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+5511999999999" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-mail (opcional)</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Sem senha por enquanto — o barbeiro só consegue logar depois que um admin definir uma em "Perfil".
          </p>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Cadastrando…" : "Cadastrar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
