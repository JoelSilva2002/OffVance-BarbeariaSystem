import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "@/lib/auth/AuthContext";

/** QueryClient sem retry — sem isso um 4xx mockado "tenta de novo" e o teste demora/falha por timeout. */
export function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

/**
 * Além do QueryClient, envolve com MemoryRouter + AuthProvider real — para
 * telas como LoginPage, que chamam useAuth()/useNavigate() diretamente.
 * AuthProvider real (não hook mockado) porque login() deve exercitar o
 * caminho de verdade staffLogin -> apiRequest -> fetch mockado.
 */
export function renderWithProviders(ui: ReactElement, { route = "/" }: { route?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
