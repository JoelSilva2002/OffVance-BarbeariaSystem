import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/components/shared/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { PhoneEntryPage } from "@/features/auth/PhoneEntryPage";
import { CodeEntryPage } from "@/features/auth/CodeEntryPage";
import { HomePage } from "@/features/home/HomePage";
import { AppointmentsPage } from "@/features/appointments/AppointmentsPage";
import { BookingEntryPage } from "@/features/booking/BookingEntryPage";
import { ProfilePage } from "@/features/profile/ProfilePage";

export function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<PhoneEntryPage />} />
      <Route path="/entrar/codigo" element={<CodeEntryPage />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="/agendamentos" element={<AppointmentsPage />} />
        <Route path="/reservar" element={<BookingEntryPage />} />
        <Route path="/perfil" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
