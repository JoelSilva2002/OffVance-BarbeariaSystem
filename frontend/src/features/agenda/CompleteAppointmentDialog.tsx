import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { ApiError } from "@/lib/api/errors";
import { completeAppointment, type Appointment, type CompletionPayment } from "@/lib/api/appointments";
import { listClientPackages } from "@/lib/api/packages";
import { getClientLoyalty } from "@/lib/api/loyalty";

const METHOD_LABELS: Record<CompletionPayment["method"], string> = {
  CASH: "Dinheiro",
  CREDIT_CARD: "Cartão de crédito",
  DEBIT_CARD: "Cartão de débito",
  PIX: "Pix",
  PACKAGE: "Pacote do cliente",
};

export function CompleteAppointmentDialog({
  appointment,
  open,
  onOpenChange,
}: {
  appointment: Appointment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<CompletionPayment["method"]>("CASH");
  const [clientPackageId, setClientPackageId] = useState<string>("");
  const [redeemPoints, setRedeemPoints] = useState<string>("");

  const clientId = appointment.clientId!;

  const packagesQuery = useQuery({
    queryKey: ["clients", clientId, "packages"],
    queryFn: () => listClientPackages(clientId),
    enabled: open && method === "PACKAGE",
  });

  const loyaltyQuery = useQuery({
    queryKey: ["clients", clientId, "loyalty"],
    queryFn: () => getClientLoyalty(clientId),
    enabled: open && method !== "PACKAGE",
  });

  const mutation = useMutation({
    mutationFn: () =>
      completeAppointment(appointment.id, {
        method,
        clientPackageId: method === "PACKAGE" ? clientPackageId : undefined,
        redeemPoints: redeemPoints ? Number(redeemPoints) : undefined,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success(result.pointsEarned > 0 ? `Concluído — ${result.pointsEarned} pontos ganhos.` : "Concluído.");
      reset();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.detail ?? "Não foi possível concluir." : "Não foi possível concluir.");
    },
  });

  function reset() {
    setMethod("CASH");
    setClientPackageId("");
    setRedeemPoints("");
  }

  const usablePackages = (packagesQuery.data?.packages ?? []).filter(
    (p) => p.status === "ACTIVE" && !p.isExpired && p.creditsRemaining > 0,
  );
  const balance = loyaltyQuery.data?.balance ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Concluir atendimento</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-border px-3 py-2 text-sm">
            <p className="text-muted-foreground">Total do atendimento</p>
            <p className="font-mono text-base text-foreground">{formatMoney(appointment.totalPriceCents)}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Forma de pagamento</Label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as CompletionPayment["method"])}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
            >
              {Object.entries(METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {method === "PACKAGE" && (
            <div className="flex flex-col gap-1.5">
              <Label>Pacote</Label>
              {packagesQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : usablePackages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Este cliente não tem pacote com créditos disponíveis.</p>
              ) : (
                <select
                  value={clientPackageId}
                  onChange={(e) => setClientPackageId(e.target.value)}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
                >
                  <option value="">Selecione…</option>
                  {usablePackages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.package.name} — {pkg.creditsRemaining} crédito(s)
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {method !== "PACKAGE" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="redeemPoints">Resgatar pontos de fidelidade (opcional)</Label>
              <Input
                id="redeemPoints"
                type="number"
                min={0}
                max={balance}
                value={redeemPoints}
                onChange={(e) => setRedeemPoints(e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">Saldo disponível: {balance} pontos</p>
            </div>
          )}

          <Button
            type="button"
            disabled={mutation.isPending || (method === "PACKAGE" && !clientPackageId)}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Concluindo…" : "Concluir"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
