import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authSession, type Session } from "./authSession";
import { tokenStore } from "./tokenStore";
import { refreshAccessToken } from "../api/client";
import { requestOtp, verifyOtp, logoutClient, type ClientProfile } from "../api/auth";

interface AuthContextValue {
  session: Session | null;
  /** true só durante o boot (F5) enquanto tenta restaurar sessão via refresh token salvo. */
  isInitializing: boolean;
  requestOtp: (phone: string) => Promise<{ expiresAt: string; devCode?: string }>;
  verifyOtp: (phone: string, code: string) => Promise<ClientProfile>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(authSession.get());
  const [isInitializing, setIsInitializing] = useState(true);
  const queryClient = useQueryClient();

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

  async function handleRequestOtp(phone: string) {
    const data = await requestOtp(phone);
    return { expiresAt: data.expiresAt, devCode: data.devCode };
  }

  async function handleVerifyOtp(phone: string, code: string) {
    const data = await verifyOtp(phone, code);
    tokenStore.set(data.refreshToken);
    authSession.set({ accessToken: data.accessToken });
    // seed inicial da query ["me"] — a Home renderiza o nome sem esperar
    // outro round-trip; useQuery(["me"]) revalida sozinho depois.
    queryClient.setQueryData(["me"], data.client);
    return data.client;
  }

  async function logout() {
    const refreshToken = tokenStore.get();
    if (refreshToken) {
      await logoutClient(refreshToken).catch(() => {
        // mesmo se a chamada falhar, a sessão local é encerrada de qualquer jeito
      });
    }
    tokenStore.clear();
    authSession.set(null);
    queryClient.clear();
  }

  return (
    <AuthContext.Provider
      value={{ session, isInitializing, requestOtp: handleRequestOtp, verifyOtp: handleVerifyOtp, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa ser usado dentro de <AuthProvider>.");
  return ctx;
}
