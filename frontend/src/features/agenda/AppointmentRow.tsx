import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { formatMoney, formatTime } from "@/lib/format";
import { ApiError } from "@/lib/api/errors";
import { cancelAppointment, checkInAppointment, confirmAppointment, markNoShow, type Appointment } from "@/lib/api/appointments";
import { CompleteAppointmentDialog } from "./CompleteAppointmentDialog";
import { ReasonDialog } from "./ReasonDialog";
import { RescheduleDialog } from "./RescheduleDialog";

export function AppointmentRow({ appointment, timezone }: { appointment: Appointment; timezone: string }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"complete" | "cancel" | "no-show" | "reschedule" | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["appointments"] });
  }

  function onError(error: unknown, fallback: string) {
    toast.error(error instanceof ApiError ? (error.detail ?? fallback) : fallback);
  }

  const confirmMutation = useMutation({
    mutationFn: () => confirmAppointment(appointment.id),
    onSuccess: () => {
      invalidate();
      toast.success("Confirmado.");
    },
    onError: (e) => onError(e, "Não foi possível confirmar."),
  });

  const checkInMutation = useMutation({
    mutationFn: () => checkInAppointment(appointment.id),
    onSuccess: () => {
      invalidate();
      toast.success("Check-in feito.");
    },
    onError: (e) => onError(e, "Não foi possível fazer check-in."),
  });

  const cancelMutation = useMutation({
    mutationFn: (reason?: string) => cancelAppointment(appointment.id, reason),
    onSuccess: () => {
      invalidate();
      toast.success("Cancelado.");
      setDialog(null);
    },
    onError: (e) => onError(e, "Não foi possível cancelar."),
  });

  const noShowMutation = useMutation({
    mutationFn: (reason?: string) => markNoShow(appointment.id, reason),
    onSuccess: () => {
      invalidate();
      toast.success("Marcado como não compareceu.");
      setDialog(null);
    },
    onError: (e) => onError(e, "Não foi possível marcar falta."),
  });

  const serviceNames = appointment.items.map((item) => item.nameSnapshot).join(", ");

  return (
    <>
      <div className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
        <div className="w-14 shrink-0 font-mono text-sm text-muted-foreground">{formatTime(appointment.startsAt, timezone)}</div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{appointment.client?.fullName ?? "Bloqueio"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {serviceNames} · {appointment.barber.displayName}
          </p>
        </div>

        <div className="w-24 shrink-0 text-right font-mono text-xs text-muted-foreground">
          {formatMoney(appointment.totalPriceCents)}
        </div>

        <StatusBadge status={appointment.status} />

        <div className="flex shrink-0 gap-1.5">
          {appointment.status === "AGENDADO" && (
            <>
              <Button size="sm" variant="secondary" disabled={confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>
                Confirmar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDialog("cancel")}>
                Cancelar
              </Button>
            </>
          )}

          {appointment.status === "CONFIRMADO" && (
            <>
              <Button size="sm" variant="secondary" disabled={checkInMutation.isPending} onClick={() => checkInMutation.mutate()}>
                Check-in
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDialog("reschedule")}>
                Remarcar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDialog("no-show")}>
                Faltou
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDialog("cancel")}>
                Cancelar
              </Button>
            </>
          )}

          {appointment.status === "EM_ATENDIMENTO" && (
            <Button size="sm" onClick={() => setDialog("complete")}>
              Concluir
            </Button>
          )}
        </div>
      </div>

      {dialog === "complete" && (
        <CompleteAppointmentDialog appointment={appointment} open onOpenChange={(open) => !open && setDialog(null)} />
      )}
      {dialog === "reschedule" && (
        <RescheduleDialog appointment={appointment} open onOpenChange={(open) => !open && setDialog(null)} />
      )}
      {dialog === "cancel" && (
        <ReasonDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title="Cancelar agendamento"
          confirmLabel="Cancelar agendamento"
          destructive
          isPending={cancelMutation.isPending}
          onConfirm={(reason) => cancelMutation.mutate(reason)}
        />
      )}
      {dialog === "no-show" && (
        <ReasonDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title="Marcar falta"
          confirmLabel="Marcar falta"
          destructive
          isPending={noShowMutation.isPending}
          onConfirm={(reason) => noShowMutation.mutate(reason)}
        />
      )}
    </>
  );
}
