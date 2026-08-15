import { NavLink, Outlet } from "react-router-dom";
import { CalendarDays, LogOut, Scissors, Users, Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof CalendarDays;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/equipe", label: "Equipe e catálogo", icon: Users, adminOnly: true },
  { to: "/financeiro", label: "Financeiro", icon: Wallet },
];

export function AppLayout() {
  const { session, logout } = useAuth();
  const isAdmin = session?.role === "ADMIN";

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex items-center gap-2 px-5 py-5">
          <Scissors className="size-5 text-primary" strokeWidth={2.25} />
          <span className="font-display text-lg font-medium tracking-tight text-foreground">Prisma</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors",
                  "hover:bg-accent hover:text-foreground",
                  isActive && "border-l-2 border-primary bg-accent pl-2.5 text-foreground",
                )
              }
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border px-3 py-3">
          <div className="px-3 py-1 text-xs text-muted-foreground">
            {session?.role === "ADMIN" ? "Administrador" : "Barbeiro"}
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut className="size-4 shrink-0" />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
