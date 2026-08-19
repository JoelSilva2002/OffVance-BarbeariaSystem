import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { AppointmentCard } from "@/components/shared/AppointmentCard";
import { listMyAppointments } from "@/lib/api/appointments";

function AppointmentsList({ scope }: { scope: "upcoming" | "past" }) {
  const { data, isLoading } = useQuery({
    queryKey: ["me", "appointments", scope],
    queryFn: () => listMyAppointments({ scope, limit: 50 }),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  const appointments = data?.appointments ?? [];
  if (appointments.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {scope === "upcoming" ? "Nenhum horário agendado." : "Nenhum atendimento anterior."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {appointments.map((appointment) => (
        // detalhe/ações (cancelar, remarcar, avaliar) chegam nas Fases 5 e 6
        <AppointmentCard key={appointment.id} appointment={appointment} />
      ))}
    </div>
  );
}

export function AppointmentsPage() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-primary">Agendamentos</h1>

      <Tabs defaultValue="upcoming">
        <TabsList className="w-full">
          <TabsTrigger value="upcoming" className="flex-1">
            Em breve
          </TabsTrigger>
          <TabsTrigger value="past" className="flex-1">
            Histórico
          </TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming" className="mt-4">
          <AppointmentsList scope="upcoming" />
        </TabsContent>
        <TabsContent value="past" className="mt-4">
          <AppointmentsList scope="past" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
