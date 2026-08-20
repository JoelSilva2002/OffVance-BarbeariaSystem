import { useState } from "react";
import { DateTime } from "luxon";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { dayRangeInTimezone } from "@/lib/format";
import { listAppointments } from "@/lib/api/appointments";
import { listBarbers } from "@/lib/api/barbers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppointmentRow } from "./AppointmentRow";
import { NewAppointmentDialog } from "./NewAppointmentDialog";

// Fuso da loja é sempre America/Sao_Paulo hoje (docs/ARQUITETURA.md) — não
// existe endpoint público que devolva timezone sem já pedir barberId/
// serviceIds, então fixamos aqui em vez de inventar uma dependência.
const SHOP_TIMEZONE = "America/Sao_Paulo";

export function AgendaPage() {
  const { session } = useAuth();
  const isAdmin = session?.role === "ADMIN";

  const [date, setDate] = useState(() => DateTime.now().setZone(SHOP_TIMEZONE).toISODate()!);
  const [barberId, setBarberId] = useState<string>("");
  const [isNewOpen, setIsNewOpen] = useState(false);

  const barbersQuery = useQuery({
    queryKey: ["barbers", "active"],
    queryFn: () => listBarbers("active"),
    enabled: isAdmin,
  });

  const { from, to } = dayRangeInTimezone(date, SHOP_TIMEZONE);

  const appointmentsQuery = useQuery({
    queryKey: ["appointments", { barberId: isAdmin ? barberId : undefined, from, to }],
    queryFn: () => listAppointments({ barberId: isAdmin && barberId ? barberId : undefined, from, to, limit: 100 }),
  });

  const appointments = (appointmentsQuery.data?.appointments ?? []).filter((a) => a.kind !== "BLOCK" || a.client);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-medium text-foreground">Agenda</h1>
        <Button onClick={() => setIsNewOpen(true)}>
          <Plus className="size-4" />
          Novo agendamento
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        {isAdmin && (
          <select
            value={barberId}
            onChange={(e) => setBarberId(e.target.value)}
            className="h-9 rounded-md border border-input bg-popover px-3 text-sm text-foreground"
          >
            <option value="">Todos os barbeiros</option>
            {barbersQuery.data?.barbers.map((barber) => (
              <option key={barber.id} value={barber.id}>
                {barber.displayName}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {appointmentsQuery.isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : appointments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum agendamento neste dia.</p>
        ) : (
          appointments.map((appointment) => (
            <AppointmentRow key={appointment.id} appointment={appointment} timezone={SHOP_TIMEZONE} />
          ))
        )}
      </div>

      <NewAppointmentDialog open={isNewOpen} onOpenChange={setIsNewOpen} />
    </div>
  );
}
