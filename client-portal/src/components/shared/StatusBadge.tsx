import type { AppointmentStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * Mesma rampa semântica de cor do painel de equipe (--status-*, ver
 * index.css), mas sem o recorte "talão de senha" — essa assinatura visual
 * é do painel (fileira de linhas pra escanear rápido); aqui é um cartão só
 * por vez, um badge simples já comunica.
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
        "inline-flex w-fit items-center gap-1.5 rounded-full py-1 px-2.5 font-sans text-xs font-medium whitespace-nowrap",
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
