import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/components/shared/RequireAuth";
import { PhoneEntryPage } from "@/features/auth/PhoneEntryPage";
import { CodeEntryPage } from "@/features/auth/CodeEntryPage";
import { HomePlaceholderPage } from "@/features/home/HomePlaceholderPage";

/**
 * Rotas de verdade chegam na Fase 3 (shell mobile com bottom tab bar) — por
 * ora só o suficiente pra provar o login OTP ponta a ponta:
 * PhoneEntryPage -> CodeEntryPage -> área autenticada.
 */
export function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<PhoneEntryPage />} />
      <Route path="/entrar/codigo" element={<CodeEntryPage />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePlaceholderPage />
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
