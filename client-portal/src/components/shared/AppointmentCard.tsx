import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { getBarber } from "@/lib/api/barbers";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Appointment } from "@/lib/api/appointments";

/**
 * `/me/appointments` não traz o nome do barbeiro (só `barberId` cru) — cada
 * card busca `GET /barbers/:id` à parte, em cache por barbeiro
 * (`["barber", id]`) então cards do mesmo barbeiro não repetem a chamada.
 */
export function AppointmentCard({ appointment, onClick }: { appointment: Appointment; onClick?: () => void }) {
  const { data: barber } = useQuery({
    queryKey: ["barber", appointment.barberId],
    queryFn: () => getBarber(appointment.barberId),
    staleTime: 5 * 60_000,
  });

  const serviceNames = appointment.items.map((item) => item.nameSnapshot).join(", ");

  return (
    <Card
      onClick={onClick}
      className={onClick ? "cursor-pointer transition-colors hover:border-primary/40" : undefined}
    >
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-[family-name:var(--font-mono)] text-sm text-muted-foreground">
            {formatDateTime(appointment.startsAt)}
          </span>
          <StatusBadge status={appointment.status} />
        </div>
        <p className="font-medium">{serviceNames}</p>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{barber?.displayName ?? "..."}</span>
          <span className="font-[family-name:var(--font-mono)]">{formatMoney(appointment.totalPriceCents)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
