import type { AppointmentStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * A assinatura visual do painel: talão de senha, com o entalhe recortado
 * na borda esquerda (via clip-path) — a fila de espera de uma barbearia de
 * verdade, não uma pill genérica de admin dashboard. Aparece em toda linha
 * de agendamento, então tem que ser barato de renderizar e legível em
 * qualquer fundo (por isso o corte é geométrico, não uma cor "disfarçada"
 * imitando o fundo).
 */
const STATUS_CONFIG: Record<AppointmentStatus, { label: string; colorVar: string }> = {
  PENDENTE_PAGAMENTO: { label: "Pendente", colorVar: "--status-scheduled" },
  AGENDADO: { label: "Agendado", colorVar: "--status-scheduled" },
  CONFIRMADO: { label: "Confirmado", colorVar: "--status-confirmed" },
  EM_ATENDIMENTO: { label: "Em atendimento", colorVar: "--status-active" },
  CONCLUIDO: { label: "Concluído", colorVar: "--status-done" },
  CANCELADO: { label: "Cancelado", colorVar: "--status-cancelled" },
  NAO_COMPARECEU: { label: "Não compareceu", colorVar: "--status-noshow" },
};

export function StatusBadge({ status, className }: { status: AppointmentStatus; className?: string }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "ticket-stub inline-flex w-fit items-center gap-1.5 py-1 pr-2.5 pl-3.5 font-sans text-xs font-medium whitespace-nowrap",
        className,
      )}
      style={{
        backgroundColor: `color-mix(in oklab, var(${config.colorVar}) 16%, transparent)`,
        color: `var(${config.colorVar})`,
      }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: `var(${config.colorVar})` }} />
      {config.label}
    </span>
  );
}
