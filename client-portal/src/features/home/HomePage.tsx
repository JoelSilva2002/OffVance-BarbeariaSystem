import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarPlus, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppointmentCard } from "@/components/shared/AppointmentCard";
import { getMe } from "@/lib/api/me";
import { listMyAppointments, getMyLastAppointment } from "@/lib/api/appointments";
import { getLoyaltySummary } from "@/lib/api/loyalty";

export function HomePage() {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const { data: upcomingData, isLoading: isLoadingUpcoming } = useQuery({
    queryKey: ["me", "appointments", "upcoming", 1],
    queryFn: () => listMyAppointments({ scope: "upcoming", limit: 1 }),
  });
  const nextAppointment = upcomingData?.appointments[0];

  const { data: lastData } = useQuery({
    queryKey: ["me", "appointments", "last"],
    queryFn: getMyLastAppointment,
  });
  const lastAppointment = lastData?.appointment;

  const { data: loyalty } = useQuery({ queryKey: ["me", "loyalty"], queryFn: getLoyaltySummary });

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-primary">
        Oi{me?.fullName ? `, ${me.fullName.split(" ")[0]}` : ""}!
      </h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Próximo horário</h2>
        {isLoadingUpcoming ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : nextAppointment ? (
          <AppointmentCard appointment={nextAppointment} />
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">Você não tem nenhum horário agendado.</p>
              <Button asChild size="sm">
                <Link to="/reservar">
                  <CalendarPlus className="size-4" />
                  Reservar horário
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>

      {lastAppointment && !lastAppointment.review && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-3">
            <Star className="size-5 shrink-0 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">Como foi seu último atendimento?</p>
              <p className="text-xs text-muted-foreground">A avaliação chega em breve por aqui.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <section className="grid grid-cols-2 gap-3">
        <Link to="/reservar">
          <Card className="h-full transition-colors hover:border-primary/40">
            <CardContent className="flex flex-col items-center gap-2 py-5 text-center">
              <CalendarPlus className="size-5 text-primary" />
              <span className="text-sm font-medium">Repetir último atendimento</span>
            </CardContent>
          </Card>
        </Link>

        {/* sem link ainda — a subpágina de Fidelidade chega na Fase 6 */}
        <Card className="h-full">
          <CardContent className="flex flex-col items-center gap-2 py-5 text-center">
            <span className="font-[family-name:var(--font-display)] text-2xl text-primary">
              {loyalty?.balance ?? "–"}
            </span>
            <span className="text-sm font-medium">Pontos de fidelidade</span>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
