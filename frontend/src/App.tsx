import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { RequireAuth } from "@/components/shared/RequireAuth";
import { RequireAdmin } from "@/components/shared/RequireAdmin";
import { LoginPage } from "@/features/auth/LoginPage";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";
import { AgendaPage } from "@/features/agenda/AgendaPage";
import { StaffPage } from "@/features/staff/StaffPage";
import { FinanceiroPage } from "@/features/financeiro/FinanceiroPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/agenda" replace />} />
        <Route path="/agenda" element={<AgendaPage />} />
        <Route
          path="/equipe"
          element={
            <RequireAdmin>
              <StaffPage />
            </RequireAdmin>
          }
        />
        <Route path="/financeiro" element={<FinanceiroPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/agenda" replace />} />
    </Routes>
  );
}
