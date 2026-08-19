export interface Session {
  accessToken: string;
}

/**
 * Estado de sessão fora do React — o wrapper de fetch (lib/api/client.ts)
 * precisa ler/atualizar o access token de dentro de uma função comum, não
 * de um componente. AuthContext.tsx só assina isso e espelha num useState
 * pra re-renderizar a árvore quando a sessão muda.
 *
 * Só `accessToken` — diferente do painel de equipe, o portal do cliente
 * tem um único tipo de sessão (sem role/barberId pra distinguir).
 */
let session: Session | null = null;
const listeners = new Set<(session: Session | null) => void>();

export const authSession = {
  get(): Session | null {
    return session;
  },
  set(next: Session | null): void {
    session = next;
    listeners.forEach((listener) => listener(next));
  },
  subscribe(listener: (session: Session | null) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
