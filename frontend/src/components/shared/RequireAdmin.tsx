import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthContext";

/**
 * Conveniência de UX (evita abrir uma página que só vai tomar 403 de
 * volta) — quem decide de verdade quem pode o quê continua sendo a API,
 * nunca este componente.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  if (session?.role !== "ADMIN") {
    return <Navigate to="/agenda" replace />;
  }
  return <>{children}</>;
}
