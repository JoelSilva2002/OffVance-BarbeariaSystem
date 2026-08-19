import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getAvailabilityDays, getAvailabilitySlots, type Slot } from "@/lib/api/availability";
import { getErrorMessage } from "@/lib/api/errors";
import { formatTime, SHOP_TIMEZONE } from "@/lib/format";
import type { BookingSelection } from "../types";

const ANY_BARBER_WINDOW_DAYS = 14;

/** "Qualquer barbeiro" — janela fixa de 14 dias, scroller horizontal de datas (não faz sentido um grid mensal pra essa janela curta). */
function AnyBarberPicker({
  serviceIds,
  onPickSlot,
}: {
  serviceIds: string[];
  onPickSlot: (slot: Slot, barberId: string) => void;
}) {
  const today = DateTime.now().setZone(SHOP_TIMEZONE);
  const from = today.toISODate()!;
  const to = today.plus({ days: ANY_BARBER_WINDOW_DAYS - 1 }).toISODate()!;

  const { data, isLoading, error } = useQuery({
    queryKey: ["availability", "slots", "any", serviceIds, from, to],
    queryFn: () => getAvailabilitySlots({ barberId: "any", serviceIds, from, to }),
  });

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const daysWithSlots = (data?.days ?? []).filter((d) => d.slots.length > 0);
  const activeDay = daysWithSlots.find((d) => d.date === selectedDate) ?? daysWithSlots[0];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-muted-foreground">{getErrorMessage(error, "Não foi possível carregar os horários.")}</p>;
  }

  if (daysWithSlots.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum horário disponível nos próximos {ANY_BARBER_WINDOW_DAYS} dias.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-2 pb-2">
          {daysWithSlots.map((day) => {
            const dt = DateTime.fromISO(day.date, { zone: SHOP_TIMEZONE }).setLocale("pt-BR");
            const isActive = day.date === activeDay?.date;
            return (
              <button
                key={day.date}
                onClick={() => setSelectedDate(day.date)}
                className={cn(
                  "flex shrink-0 flex-col items-center gap-0.5 rounded-lg border px-3 py-2 text-xs",
                  isActive ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                )}
              >
                <span className="uppercase">{dt.toFormat("EEE")}</span>
                <span className="text-sm font-medium">{dt.toFormat("dd")}</span>
              </button>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {activeDay && (
        <div className="grid grid-cols-3 gap-2">
          {activeDay.slots.map((slot) => (
            <Button
              key={slot.startsAt}
              variant="outline"
              size="sm"
              onClick={() => onPickSlot(slot, slot.barberIds![0]!)}
            >
              {formatTime(slot.startsAt)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Barbeiro específico — grid mensal de verdade (GET /availability/days foi feito pra isso). */
function SpecificBarberPicker({
  barberId,
  serviceIds,
  onPickSlot,
}: {
  barberId: string;
  serviceIds: string[];
  onPickSlot: (slot: Slot) => void;
}) {
  const [viewMonth, setViewMonth] = useState(() => DateTime.now().setZone(SHOP_TIMEZONE));
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const month = viewMonth.toFormat("yyyy-MM");

  const { data: daysData, isLoading: isLoadingDays } = useQuery({
    queryKey: ["availability", "days", barberId, serviceIds, month],
    queryFn: () => getAvailabilityDays({ barberId, serviceIds, month }),
  });
  const availableDates = useMemo(() => new Set(daysData?.days ?? []), [daysData]);

  const selectedDateKey = selectedDate ? DateTime.fromJSDate(selectedDate).toISODate() : null;
  const { data: slotsData, isLoading: isLoadingSlots } = useQuery({
    queryKey: ["availability", "slots", barberId, serviceIds, selectedDateKey],
    queryFn: () => getAvailabilitySlots({ barberId, serviceIds, from: selectedDateKey!, to: selectedDateKey! }),
    enabled: Boolean(selectedDateKey),
  });
  const slots = slotsData?.days[0]?.slots ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Calendar
        mode="single"
        locale={undefined}
        selected={selectedDate}
        onSelect={setSelectedDate}
        month={viewMonth.toJSDate()}
        onMonthChange={(date) => setViewMonth(DateTime.fromJSDate(date).setZone(SHOP_TIMEZONE))}
        disabled={(date) => !isLoadingDays && !availableDates.has(DateTime.fromJSDate(date).toISODate()!)}
        className="mx-auto"
      />

      {isLoadingDays && <Skeleton className="h-8 w-full rounded-lg" />}

      {selectedDateKey &&
        (isLoadingSlots ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : slots.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">Sem horários livres neste dia.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {slots.map((slot) => (
              <Button key={slot.startsAt} variant="outline" size="sm" onClick={() => onPickSlot(slot)}>
                {formatTime(slot.startsAt)}
              </Button>
            ))}
          </div>
        ))}
    </div>
  );
}

export function DateTimeStep({
  selection,
  onChange,
  onNext,
  onBack,
}: {
  selection: BookingSelection;
  onChange: (next: Partial<BookingSelection>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  function handlePicked(slot: Slot, resolvedBarberId?: string) {
    if (resolvedBarberId) onChange({ barberId: resolvedBarberId, startsAt: slot.startsAt });
    else onChange({ startsAt: slot.startsAt });
    onNext();
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-28">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-primary">Escolha o horário</h1>

      {selection.barberMode === "any" ? (
        <AnyBarberPicker
          serviceIds={selection.serviceIds}
          onPickSlot={(slot, barberId) => {
            if (!barberId) {
              toast.error("Não foi possível identificar o barbeiro para esse horário.");
              return;
            }
            handlePicked(slot, barberId);
          }}
        />
      ) : (
        <SpecificBarberPicker
          barberId={selection.barberId!}
          serviceIds={selection.serviceIds}
          onPickSlot={(slot) => handlePicked(slot)}
        />
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card p-4 pb-safe">
        <div className="mx-auto max-w-md">
          <Button variant="outline" onClick={onBack}>
            Voltar
          </Button>
        </div>
      </div>
    </div>
  );
}
