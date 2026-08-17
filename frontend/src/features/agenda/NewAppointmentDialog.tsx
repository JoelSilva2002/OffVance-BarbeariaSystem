import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ClientPicker } from "@/components/shared/ClientPicker";
import { cn } from "@/lib/utils";
import { formatDateLabel, formatMoney, formatTime } from "@/lib/format";
import { useAuth } from "@/lib/auth/AuthContext";
import { ApiError } from "@/lib/api/errors";
import { listServices, type Service } from "@/lib/api/catalog";
import { listBarbers } from "@/lib/api/barbers";
import { getAvailableSlots } from "@/lib/api/availability";
import { createAppointment } from "@/lib/api/appointments";
import type { ClientSummary } from "@/lib/api/clients";

const DAYS_AHEAD = 7;

export function NewAppointmentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const [client, setClient] = useState<ClientSummary | null>(null);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [barberMode, setBarberMode] = useState<string>("any");
  const [selectedSlot, setSelectedSlot] = useState<{ startsAt: string; barberId: string } | null>(null);
  const [clientNotes, setClientNotes] = useState("");

  const isAdmin = session?.role === "ADMIN";
  const effectiveBarberId = isAdmin ? barberMode : (session?.barberId ?? "");

  const servicesQuery = useQuery({
    queryKey: ["services", "bookable"],
    queryFn: () => listServices({ active: true, bookable: true }),
  });

  const barbersQuery = useQuery({
    queryKey: ["barbers", "active"],
    queryFn: () => listBarbers("active"),
    enabled: isAdmin,
  });

  const { from, to } = useMemo(() => {
    const now = DateTime.now();
    return { from: now.toISODate()!, to: now.plus({ days: DAYS_AHEAD }).toISODate()! };
  }, []);

  const slotsQuery = useQuery({
    queryKey: ["availability", "slots", effectiveBarberId, serviceIds, from, to],
    queryFn: () => getAvailableSlots({ barberId: effectiveBarberId, serviceIds, from, to }),
    enabled: serviceIds.length > 0 && Boolean(effectiveBarberId),
  });

  const createMutation = useMutation({
    mutationFn: createAppointment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Agendamento criado.");
      handleClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.title === "SLOT_TAKEN") {
        toast.error("Esse horário acabou de ser ocupado — escolha outro.");
        setSelectedSlot(null);
        slotsQuery.refetch();
        return;
      }
      toast.error(error instanceof ApiError ? error.detail ?? "Não foi possível agendar." : "Não foi possível agendar.");
    },
  });

  function toggleService(id: string) {
    setSelectedSlot(null);
    setServiceIds((current) => (current.includes(id) ? current.filter((s) => s !== id) : [...current, id]));
  }

  function handleClose() {
    setClient(null);
    setServiceIds([]);
    setBarberMode("any");
    setSelectedSlot(null);
    setClientNotes("");
    onOpenChange(false);
  }

  function handleSubmit() {
    if (!client || !selectedSlot) return;
    createMutation.mutate({
      clientId: client.id,
      barberId: selectedSlot.barberId,
      serviceIds,
      startsAt: selectedSlot.startsAt,
      clientNotes: clientNotes || undefined,
    });
  }

  const services = servicesQuery.data?.services ?? [];
  const timezone = slotsQuery.data?.timezone ?? "America/Sao_Paulo";
  const days = (slotsQuery.data?.days ?? []).filter((day) => day.slots.length > 0);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Novo agendamento</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label>Cliente</Label>
            <ClientPicker value={client} onChange={setClient} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Serviços</Label>
            {servicesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : (
              <div className="flex flex-col gap-1 rounded-md border border-border p-2">
                {services.map((service) => (
                  <ServiceRow
                    key={service.id}
                    service={service}
                    checked={serviceIds.includes(service.id)}
                    onToggle={() => toggleService(service.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="flex flex-col gap-1.5">
              <Label>Barbeiro</Label>
              <select
                value={barberMode}
                onChange={(e) => {
                  setBarberMode(e.target.value);
                  setSelectedSlot(null);
                }}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
              >
                <option value="any">Qualquer barbeiro disponível</option>
                {barbersQuery.data?.barbers.map((barber) => (
                  <option key={barber.id} value={barber.id}>
                    {barber.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {serviceIds.length > 0 && effectiveBarberId && (
            <div className="flex flex-col gap-1.5">
              <Label>Horário</Label>
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
                        {day.slots.map((slot) => {
                          const slotBarberId = barberMode === "any" ? slot.barberIds?.[0] : effectiveBarberId;
                          const isSelected = selectedSlot?.startsAt === slot.startsAt;
                          return (
                            <button
                              key={slot.startsAt}
                              type="button"
                              onClick={() => slotBarberId && setSelectedSlot({ startsAt: slot.startsAt, barberId: slotBarberId })}
                              className={cn(
                                "rounded-md border border-border px-2.5 py-1 font-mono text-xs text-foreground hover:border-primary",
                                isSelected && "border-primary bg-primary/15 text-primary",
                              )}
                            >
                              {formatTime(slot.startsAt, timezone)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="clientNotes">Observações (opcional)</Label>
            <Textarea id="clientNotes" value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} rows={2} />
          </div>

          <Button
            type="button"
            disabled={!client || !selectedSlot || createMutation.isPending}
            onClick={handleSubmit}
          >
            {createMutation.isPending ? "Agendando…" : "Agendar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ServiceRow({ service, checked, onToggle }: { service: Service; checked: boolean; onToggle: () => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
      <span className="flex items-center gap-2">
        <input type="checkbox" checked={checked} onChange={onToggle} className="accent-primary" />
        <span className="text-foreground">{service.name}</span>
        <span className="text-xs text-muted-foreground">{service.durationMin}min</span>
      </span>
      <span className="font-mono text-xs text-muted-foreground">{formatMoney(service.priceCents)}</span>
    </label>
  );
}
