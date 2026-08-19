import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ServiceStep } from "./steps/ServiceStep";
import { BarberStep } from "./steps/BarberStep";
import { DateTimeStep } from "./steps/DateTimeStep";
import { ConfirmStep } from "./steps/ConfirmStep";
import { EMPTY_SELECTION, type BookingSelection, type RepeatSource } from "./types";

interface BookingLocationState {
  repeatOf?: RepeatSource;
}

/**
 * Wizard de 4 passos: Serviços -> Barbeiro -> Data/horário -> Confirmação.
 * O atalho "repetir último atendimento" (Início) chega aqui via
 * `location.state.repeatOf` e pula direto pro passo 3 — barbeiro/serviços
 * já vêm resolvidos do atendimento de origem, só falta escolher o novo
 * horário. "Voltar" nesse caminho não tem passo 2 pra voltar, então some
 * pra Início em vez de decrementar.
 */
export function BookingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const repeatOf = (location.state as BookingLocationState | null)?.repeatOf;

  const [step, setStep] = useState(repeatOf ? 3 : 1);
  const [selection, setSelection] = useState<BookingSelection>(() =>
    repeatOf
      ? { ...EMPTY_SELECTION, repeatOf, barberMode: "specific", barberId: repeatOf.barberId, serviceIds: repeatOf.serviceIds }
      : EMPTY_SELECTION,
  );

  const minStep = repeatOf ? 3 : 1;

  function updateSelection(next: Partial<BookingSelection>) {
    setSelection((prev) => ({ ...prev, ...next }));
  }

  function goBack() {
    if (step > minStep) setStep(step - 1);
    else navigate("/");
  }

  function handleSuccess() {
    navigate("/agendamentos", { replace: true });
  }

  switch (step) {
    case 1:
      return <ServiceStep selection={selection} onChange={updateSelection} onNext={() => setStep(2)} />;
    case 2:
      return (
        <BarberStep selection={selection} onChange={updateSelection} onNext={() => setStep(3)} onBack={goBack} />
      );
    case 3:
      return (
        <DateTimeStep selection={selection} onChange={updateSelection} onNext={() => setStep(4)} onBack={goBack} />
      );
    case 4:
      return (
        <ConfirmStep selection={selection} onChange={updateSelection} onBack={() => setStep(3)} onSuccess={handleSuccess} />
      );
    default:
      return null;
  }
}
