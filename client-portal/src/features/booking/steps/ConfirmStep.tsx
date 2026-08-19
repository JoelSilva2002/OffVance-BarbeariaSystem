import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getBarber } from "@/lib/api/barbers";
import { listServices } from "@/lib/api/catalog";
import { createMyAppointment } from "@/lib/api/appointments";
import { ApiError, getErrorMessage } from "@/lib/api/errors";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { BookingSelection } from "../types";

export function ConfirmStep({
  selection,
  onChange,
  onBack,
  onSuccess,
}: {
  selection: BookingSelection;
  onChange: (next: Partial<BookingSelection>) => void;
  /** "Voltar" e a recuperação de erro (horário indisponível etc.) levam pro mesmo lugar: o passo de data/hora. */
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: barber } = useQuery({
    queryKey: ["barber", selection.barberId],
    queryFn: () => getBarber(selection.barberId!),
    enabled: Boolean(selection.barberId),
  });

  // `repeatOf` não precisa dessa lista pra montar o resumo — os serviços já
  // vêm do agendamento de origem (selection.serviceIds foi preenchido com
  // eles no atalho "repetir"), então dá pra reusar o mesmo `listServices`
  // sem outra chamada dedicada.
  const { data: servicesData } = useQuery({ queryKey: ["services"], queryFn: listServices });
  const selectedServices = (servicesData?.services ?? []).filter((s) => selection.serviceIds.includes(s.id));
  const totalCents = selectedServices.reduce((sum, s) => sum + s.priceCents, 0);

  async function handleConfirm() {
    if (!selection.startsAt || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await createMyAppointment(
        selection.repeatOf
          ? { repeatOf: selection.repeatOf.id, startsAt: selection.startsAt, clientNotes: selection.clientNotes || undefined }
          : {
              barberId: selection.barberId!,
              serviceIds: selection.serviceIds,
              startsAt: selection.startsAt,
              clientNotes: selection.clientNotes || undefined,
            },
      );
      toast.success("Horário reservado!");
      onSuccess();
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível reservar o horário."));
      // conflito de horário ou qualquer recusa de agenda — volta pro passo
      // de data/horário pra escolher de novo, não adianta insistir no mesmo
      const SLOT_ERRORS = new Set([
        "SLOT_TAKEN",
        "OUTSIDE_WORKING_HOURS",
        "LEAD_TIME_TOO_SHORT",
        "TOO_FAR_IN_ADVANCE",
        "BARBER_NOT_QUALIFIED",
        "SERVICE_INACTIVE",
        "BARBER_INACTIVE",
      ]);
      if (error instanceof ApiError && SLOT_ERRORS.has(error.title)) {
        onBack();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-28">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-primary">Confirmar reserva</h1>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <p className="text-xs text-muted-foreground">Serviços</p>
          <p className="text-sm font-medium">
            {selection.repeatOf ? "Mesmo do atendimento anterior" : selectedServices.map((s) => s.name).join(", ")}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Barbeiro</p>
          <p className="text-sm font-medium">{barber?.displayName ?? "..."}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Data e hora</p>
          <p className="text-sm font-medium">{selection.startsAt ? formatDateTime(selection.startsAt) : "—"}</p>
        </div>
        {!selection.repeatOf && (
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-sm font-medium">{formatMoney(totalCents)}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Observações (opcional)</Label>
        <Textarea
          id="notes"
          placeholder="Alguma preferência ou observação?"
          value={selection.clientNotes}
          onChange={(e) => onChange({ clientNotes: e.target.value })}
          maxLength={1000}
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card p-4 pb-safe">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
            Voltar
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting} className="flex-1">
            {isSubmitting ? "Reservando..." : "Confirmar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
