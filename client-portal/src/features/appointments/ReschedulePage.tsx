import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateTimeStep } from "@/features/booking/steps/DateTimeStep";
import { EMPTY_SELECTION, type BookingSelection } from "@/features/booking/types";
import { getBarber } from "@/lib/api/barbers";
import { rescheduleMyAppointment } from "@/lib/api/appointments";
import { getErrorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/format";

interface RescheduleLocationState {
  barberId: string;
  serviceIds: string[];
  startsAt: string;
}

/**
 * Fora do AppShell, mesma razão do BookingPage — barra de ação fixa
 * própria. Reaproveita o DateTimeStep do fluxo de reserva (Fase 4), sempre
 * em modo "barbeiro específico": `rescheduleMyAppointmentSchema` permite
 * trocar de barbeiro, mas não os serviços, então "qualquer barbeiro" não
 * faria sentido aqui.
 */
export function ReschedulePage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const state = location.state as RescheduleLocationState | null;

  const [selection, setSelection] = useState<BookingSelection>(() => ({
    ...EMPTY_SELECTION,
    barberMode: "specific",
    barberId: state?.barberId ?? null,
    serviceIds: state?.serviceIds ?? [],
  }));
  const [step, setStep] = useState<"pick" | "confirm">("pick");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: barber } = useQuery({
    queryKey: ["barber", selection.barberId],
    queryFn: () => getBarber(selection.barberId!),
    enabled: Boolean(selection.barberId),
  });

  if (!id || !state) {
    navigate("/agendamentos", { replace: true });
    return null;
  }

  function updateSelection(next: Partial<BookingSelection>) {
    setSelection((prev) => ({ ...prev, ...next }));
  }

  async function handleConfirm() {
    if (!selection.startsAt || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await rescheduleMyAppointment(id!, { startsAt: selection.startsAt, barberId: selection.barberId ?? undefined });
      await queryClient.invalidateQueries({ queryKey: ["me", "appointments"] });
      toast.success("Agendamento remarcado!");
      navigate("/agendamentos", { replace: true });
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível remarcar o agendamento."));
      setStep("pick");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (step === "pick") {
    return (
      <DateTimeStep
        selection={selection}
        onChange={updateSelection}
        onNext={() => setStep("confirm")}
        onBack={() => navigate("/agendamentos")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-28">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-primary">Confirmar novo horário</h1>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <p className="text-xs text-muted-foreground">Barbeiro</p>
          <p className="text-sm font-medium">{barber?.displayName ?? "..."}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Novo horário</p>
          <p className="text-sm font-medium">{selection.startsAt ? formatDateTime(selection.startsAt) : "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Horário anterior</p>
          <p className="text-sm text-muted-foreground line-through">{formatDateTime(state.startsAt)}</p>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card p-4 pb-safe">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <Button variant="outline" onClick={() => setStep("pick")} disabled={isSubmitting}>
            Voltar
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting} className="flex-1">
            {isSubmitting ? "Remarcando..." : "Confirmar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
