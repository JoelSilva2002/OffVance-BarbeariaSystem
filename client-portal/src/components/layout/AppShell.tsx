import { NavLink, Outlet } from "react-router-dom";
import { CalendarDays, CalendarPlus, House, User } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/", label: "Início", icon: House, end: true },
  { to: "/agendamentos", label: "Agendamentos", icon: CalendarDays, end: false },
  { to: "/reservar", label: "Reservar", icon: CalendarPlus, end: false },
  { to: "/perfil", label: "Perfil", icon: User, end: false },
] as const;

/**
 * Bottom tab bar — substitui o AppLayout de sidebar do painel de equipe
 * (desktop). Fidelidade/pacotes ficam sob Perfil, não como aba própria:
 * consulta esporádica, não merece competir por espaço numa bottom bar que
 * já tem 4 itens (limite prático mobile).
 */
export function AppShell() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-card pb-safe">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground",
                )
              }
            >
              <Icon className="size-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
