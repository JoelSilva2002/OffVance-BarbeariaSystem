import { useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { getBarber } from "@/lib/api/barbers";
import { cancelMyAppointment, type Appointment } from "@/lib/api/appointments";
import { getErrorMessage } from "@/lib/api/errors";
import { formatDateTime, formatMoney } from "@/lib/format";

const ACTIONABLE_STATUSES = new Set(["AGENDADO", "CONFIRMADO"]);

export function AppointmentDetailDrawer({
  appointment,
  onClose,
  onReview,
}: {
  appointment: Appointment | null;
  onClose: () => void;
  /** CONCLUIDO sem review ainda — abre o ReviewSheet (gerenciado pela página, não aqui). */
  onReview: (appointmentId: string) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const { data: barber } = useQuery({
    queryKey: ["barber", appointment?.barberId],
    queryFn: () => getBarber(appointment!.barberId),
    enabled: Boolean(appointment),
  });

  if (!appointment) return null;

  const canAct = ACTIONABLE_STATUSES.has(appointment.status);
  const canReview = appointment.status === "CONCLUIDO" && !appointment.review;
  const serviceNames = appointment.items.map((item) => item.nameSnapshot).join(", ");

  async function handleCancel(event: MouseEvent) {
    // `preventDefault` segura o AlertDialog aberto — por padrão o Action
    // fecha sozinho ao clicar, mas erro de prazo (CANCEL_DEADLINE_PASSED)
    // precisa aparecer DENTRO do diálogo, não sumir junto com ele.
    event.preventDefault();
    setIsCancelling(true);
    setCancelError(null);
    try {
      await cancelMyAppointment(appointment!.id, cancelReason || undefined);
      await queryClient.invalidateQueries({ queryKey: ["me", "appointments"] });
      toast.success("Agendamento cancelado.");
      onClose();
    } catch (error) {
      setCancelError(getErrorMessage(error, "Não foi possível cancelar o agendamento."));
    } finally {
      setIsCancelling(false);
    }
  }

  function handleReschedule() {
    navigate(`/agendamentos/${appointment!.id}/remarcar`, {
      state: {
        barberId: appointment!.barberId,
        serviceIds: appointment!.items.map((item) => item.serviceId),
        startsAt: appointment!.startsAt,
      },
    });
  }

  return (
    <Drawer open={Boolean(appointment)} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{serviceNames}</DrawerTitle>
          <DrawerDescription>{formatDateTime(appointment.startsAt)}</DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-3 px-4 pb-4">
          <StatusBadge status={appointment.status} className="w-fit" />

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Barbeiro</span>
            <span>{barber?.displayName ?? "..."}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-[family-name:var(--font-mono)]">{formatMoney(appointment.totalPriceCents)}</span>
          </div>
          {appointment.clientNotes && (
            <div>
              <p className="text-xs text-muted-foreground">Observações</p>
              <p className="text-sm">{appointment.clientNotes}</p>
            </div>
          )}
          {appointment.cancelReason && (
            <div>
              <p className="text-xs text-muted-foreground">Motivo do cancelamento</p>
              <p className="text-sm">{appointment.cancelReason}</p>
            </div>
          )}
          {appointment.review && (
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Sua avaliação</p>
              <p className="text-sm font-medium">{"★".repeat(appointment.review.rating)}</p>
              {appointment.review.comment && <p className="text-sm text-muted-foreground">{appointment.review.comment}</p>}
            </div>
          )}
        </div>

        {canAct && (
          <DrawerFooter>
            <Button onClick={handleReschedule}>Remarcar</Button>

            <AlertDialog
              onOpenChange={(open) => {
                if (!open) {
                  setCancelReason("");
                  setCancelError(null);
                }
              }}
            >
              <AlertDialogTrigger asChild>
                <Button variant="outline">Cancelar agendamento</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar este agendamento?</AlertDialogTitle>
                  <AlertDialogDescription>{serviceNames} — {formatDateTime(appointment.startsAt)}</AlertDialogDescription>
                </AlertDialogHeader>
                <Textarea
                  placeholder="Motivo (opcional)"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  maxLength={500}
                />
                {cancelError && <p className="text-sm text-destructive">{cancelError}</p>}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isCancelling}>Voltar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCancel} disabled={isCancelling}>
                    {isCancelling ? "Cancelando..." : "Confirmar cancelamento"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </DrawerFooter>
        )}

        {canReview && (
          <DrawerFooter>
            <Button
              onClick={() => {
                onReview(appointment.id);
                onClose();
              }}
            >
              Avaliar atendimento
            </Button>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}
