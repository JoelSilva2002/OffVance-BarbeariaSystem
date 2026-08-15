import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authSession, type Session } from "./authSession";
import { tokenStore } from "./tokenStore";
import { refreshAccessToken } from "../api/client";
import { staffLogin, staffLogout } from "../api/auth";

interface AuthContextValue {
  session: Session | null;
  /** true só durante o boot (F5) enquanto tenta restaurar sessão via refresh token salvo. */
  isInitializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(authSession.get());
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => authSession.subscribe(setSession), []);

  // Ao recarregar a página o access token (só em memória) some, mas o
  // refresh token sobrevive no localStorage — tenta restaurar a sessão
  // uma vez antes de decidir que o usuário está deslogado.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!authSession.get() && tokenStore.get()) {
        try {
          await refreshAccessToken();
        } catch {
          // refresh token inválido/expirado — segue deslogado, sem erro visível aqui
        }
      }
      if (!cancelled) setIsInitializing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email: string, password: string) {
    const data = await staffLogin(email, password);
    tokenStore.set(data.refreshToken);
    authSession.set({ accessToken: data.accessToken, role: data.role, barberId: data.barberId });
  }

  async function logout() {
    const refreshToken = tokenStore.get();
    if (refreshToken) {
      await staffLogout(refreshToken).catch(() => {
        // mesmo se a chamada falhar, a sessão local é encerrada de qualquer jeito
      });
    }
    tokenStore.clear();
    authSession.set(null);
  }

  return <AuthContext.Provider value={{ session, isInitializing, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa ser usado dentro de <AuthProvider>.");
  return ctx;
}
