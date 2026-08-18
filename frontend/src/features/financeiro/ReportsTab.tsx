import { useState } from "react";
import { DateTime } from "luxon";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";
import { getAppointmentsReport, getRevenueReport } from "@/lib/api/reports";

export function ReportsTab() {
  const [from, setFrom] = useState(() => DateTime.now().minus({ days: 30 }).toISODate()!);
  const [to, setTo] = useState(() => DateTime.now().toISODate()!);

  const appointmentsReport = useQuery({
    queryKey: ["reports", "appointments", from, to],
    queryFn: () => getAppointmentsReport({ from, to, granularity: "day" }),
  });

  const revenueReport = useQuery({
    queryKey: ["reports", "revenue", from, to],
    queryFn: () => getRevenueReport({ from, to, granularity: "month", groupBy: "method" }),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reportFrom">De</Label>
          <Input id="reportFrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reportTo">Até</Label>
          <Input id="reportTo" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg text-foreground">Faturamento</h2>
        {revenueReport.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="Serviços"
                value={formatMoney(revenueReport.data?.series.reduce((s, p) => s + p.serviceRevenueCents, 0) ?? 0)}
              />
              <StatCard
                label="Produtos"
                value={formatMoney(revenueReport.data?.series.reduce((s, p) => s + p.productRevenueCents, 0) ?? 0)}
              />
              <StatCard
                label="Pacotes"
                value={formatMoney(revenueReport.data?.series.reduce((s, p) => s + p.packageRevenueCents, 0) ?? 0)}
              />
            </div>

            {revenueReport.data?.byMethod && revenueReport.data.byMethod.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Forma de pagamento</th>
                      <th className="px-4 py-2 text-right font-medium">Valor</th>
                      <th className="px-4 py-2 text-right font-medium">Qtd.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueReport.data.byMethod.map((row) => (
                      <tr key={row.method} className="border-b border-border last:border-b-0">
                        <td className="px-4 py-2 text-foreground">{row.method}</td>
                        <td className="px-4 py-2 text-right font-mono text-foreground">{formatMoney(row.amountCents)}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {revenueReport.data?.productMargin && revenueReport.data.productMargin.revenueCents > 0 && (
              <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
                <p className="text-muted-foreground">Margem de produtos</p>
                <p className="font-mono text-foreground">
                  {formatMoney(revenueReport.data.productMargin.marginCents)} (
                  {(revenueReport.data.productMargin.marginPct * 100).toFixed(0)}%)
                </p>
              </div>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg text-foreground">Agendamentos por dia</h2>
        {appointmentsReport.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (appointmentsReport.data?.series.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">Sem agendamentos no período.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Dia</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                  <th className="px-4 py-2 text-right font-medium">Faltas</th>
                  <th className="px-4 py-2 text-right font-medium">Cancelamentos</th>
                </tr>
              </thead>
              <tbody>
                {appointmentsReport.data?.series.map((row) => (
                  <tr key={row.period} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2 text-foreground">{row.period}</td>
                    <td className="px-4 py-2 text-right font-mono text-foreground">{row.total}</td>
                    <td className="px-4 py-2 text-right font-mono text-status-noshow">{(row.noShowRate * 100).toFixed(0)}%</td>
                    <td className="px-4 py-2 text-right font-mono text-status-cancelled">{(row.cancelRate * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(appointmentsReport.data?.occupancyByBarber.length ?? 0) > 0 && (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Barbeiro</th>
                  <th className="px-4 py-2 text-right font-medium">Ocupação</th>
                </tr>
              </thead>
              <tbody>
                {appointmentsReport.data?.occupancyByBarber.map((row) => (
                  <tr key={row.barberId} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2 text-foreground">{row.displayName}</td>
                    <td className="px-4 py-2 text-right font-mono text-foreground">{(row.occupancyPct * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-lg text-foreground">{value}</p>
    </div>
  );
}
