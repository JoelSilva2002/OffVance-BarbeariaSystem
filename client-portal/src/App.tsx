import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/components/shared/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { PhoneEntryPage } from "@/features/auth/PhoneEntryPage";
import { CodeEntryPage } from "@/features/auth/CodeEntryPage";
import { HomePage } from "@/features/home/HomePage";
import { AppointmentsPage } from "@/features/appointments/AppointmentsPage";
import { BookingPage } from "@/features/booking/BookingPage";
import { ReschedulePage } from "@/features/appointments/ReschedulePage";
import { ProfilePage } from "@/features/profile/ProfilePage";

export function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<PhoneEntryPage />} />
      <Route path="/entrar/codigo" element={<CodeEntryPage />} />

      {/* /reservar fica FORA do AppShell de propósito — o wizard tem sua
          própria barra de ação fixa no rodapé (Continuar/Voltar/Confirmar),
          que sobreporia a bottom tab bar se os dois competissem pelo mesmo
          espaço fixo. Tela cheia durante o fluxo, sem a tab bar por baixo. */}
      <Route
        path="/reservar"
        element={
          <RequireAuth>
            <BookingPage />
          </RequireAuth>
        }
      />

      <Route
        path="/agendamentos/:id/remarcar"
        element={
          <RequireAuth>
            <ReschedulePage />
          </RequireAuth>
        }
      />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="/agendamentos" element={<AppointmentsPage />} />
        <Route path="/perfil" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
