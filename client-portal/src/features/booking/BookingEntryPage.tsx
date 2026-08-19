import { CalendarPlus } from "lucide-react";

/** Fluxo de reserva de verdade chega na Fase 4 (serviços -> barbeiro -> data/horário -> confirmação). */
export function BookingEntryPage() {
  return (
    <div className="flex flex-col items-center gap-3 p-8 pt-24 text-center">
      <CalendarPlus className="size-10 text-primary" />
      <h1 className="font-[family-name:var(--font-display)] text-xl text-primary">Reservar horário</h1>
      <p className="text-sm text-muted-foreground">Em breve você vai poder marcar seu horário direto por aqui.</p>
    </div>
  );
}
