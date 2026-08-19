export interface RepeatSource {
  id: string;
  barberId: string;
  serviceIds: string[];
}

/** Estado do formulário de reserva, compartilhado entre os 4 passos. */
export interface BookingSelection {
  serviceIds: string[];
  barberMode: "any" | "specific";
  /** Sempre concreto ao chegar no passo 4 — POST /me/appointments não aceita "any" (me.service.ts:91). */
  barberId: string | null;
  startsAt: string | null;
  clientNotes: string;
  repeatOf: RepeatSource | null;
}

export const EMPTY_SELECTION: BookingSelection = {
  serviceIds: [],
  barberMode: "any",
  barberId: null,
  startsAt: null,
  clientNotes: "",
  repeatOf: null,
};
