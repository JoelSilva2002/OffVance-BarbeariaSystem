import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatDateLabel, formatTime } from "@/lib/format";
import { ApiError } from "@/lib/api/errors";
import { getAvailableSlots } from "@/lib/api/availability";
import { rescheduleAppointment, type Appointment } from "@/lib/api/appointments";

const DAYS_AHEAD = 7;

export function RescheduleDialog({
  appointment,
  open,
  onOpenChange,
}: {
  appointment: Appointment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [pendingSlot, setPendingSlot] = useState<string | null>(null);
  const serviceIds = useMemo(() => appointment.items.map((item) => item.serviceId), [appointment.items]);

  const { from, to } = useMemo(() => {
    const now = DateTime.now();
    return { from: now.toISODate()!, to: now.plus({ days: DAYS_AHEAD }).toISODate()! };
  }, []);

  const slotsQuery = useQuery({
    queryKey: ["availability", "slots", appointment.barberId, serviceIds, from, to],
    queryFn: () => getAvailableSlots({ barberId: appointment.barberId, serviceIds, from, to }),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: (startsAt: string) => rescheduleAppointment(appointment.id, startsAt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Agendamento remarcado.");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.detail ?? "Não foi possível remarcar." : "Não foi possível remarcar.");
      setPendingSlot(null);
    },
  });

  const timezone = slotsQuery.data?.timezone ?? "America/Sao_Paulo";
  const days = (slotsQuery.data?.days ?? []).filter((day) => day.slots.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Remarcar</DialogTitle>
        </DialogHeader>

        {slotsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Buscando horários…</p>
        ) : days.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum horário livre nos próximos {DAYS_AHEAD} dias.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {days.map((day) => (
              <div key={day.date}>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase">
                  {formatDateLabel(day.slots[0]!.startsAt, timezone)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {day.slots.map((slot) => (
                    <button
                      key={slot.startsAt}
                      type="button"
                      disabled={mutation.isPending}
                      onClick={() => {
                        setPendingSlot(slot.startsAt);
                        mutation.mutate(slot.startsAt);
                      }}
                      className={cn(
                        "rounded-md border border-border px-2.5 py-1 font-mono text-xs text-foreground hover:border-primary disabled:opacity-50",
                        pendingSlot === slot.startsAt && "border-primary bg-primary/15 text-primary",
                      )}
                    >
                      {formatTime(slot.startsAt, timezone)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
