import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, isoTimeToHHmm } from "@/lib/format";
import { listServices } from "@/lib/api/catalog";
import {
  createTimeOff,
  getBarber,
  getSchedule,
  putBarberServices,
  putSchedule,
  updateBarber,
  type BarberWithServices,
} from "@/lib/api/barbers";

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function BarberDetailDialog({
  barberId,
  open,
  onOpenChange,
}: {
  barberId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const barberQuery = useQuery({ queryKey: ["barbers", barberId], queryFn: () => getBarber(barberId) });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{barberQuery.data?.displayName ?? "Barbeiro"}</DialogTitle>
        </DialogHeader>

        {barberQuery.isLoading || !barberQuery.data ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <Tabs defaultValue="perfil">
            <TabsList>
              <TabsTrigger value="perfil">Perfil</TabsTrigger>
              <TabsTrigger value="servicos">Serviços</TabsTrigger>
              <TabsTrigger value="grade">Grade</TabsTrigger>
              <TabsTrigger value="folgas">Folgas</TabsTrigger>
            </TabsList>
            <TabsContent value="perfil" className="mt-4">
              <ProfileTab barber={barberQuery.data} />
            </TabsContent>
            <TabsContent value="servicos" className="mt-4">
              <ServicesTab barber={barberQuery.data} />
            </TabsContent>
            <TabsContent value="grade" className="mt-4">
              <ScheduleTab barberId={barberId} />
            </TabsContent>
            <TabsContent value="folgas" className="mt-4">
              <TimeOffTab barberId={barberId} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProfileTab({ barber }: { barber: BarberWithServices }) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(barber.displayName);
  const [bio, setBio] = useState(barber.bio ?? "");
  const [status, setStatus] = useState(barber.status);
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: () => updateBarber(barber.id, { displayName, bio: bio || null, status, password: password || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barbers"] });
      toast.success("Perfil atualizado.");
      setPassword("");
    },
    onError: () => toast.error("Não foi possível salvar."),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="editDisplayName">Nome</Label>
        <Input id="editDisplayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="editBio">Bio</Label>
        <Textarea id="editBio" value={bio} onChange={(e) => setBio(e.target.value)} rows={2} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Status</Label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "ACTIVE" | "INACTIVE")}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
        >
          <option value="ACTIVE">Ativo</option>
          <option value="INACTIVE">Inativo</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="editPassword">Redefinir senha (opcional)</Label>
        <Input id="editPassword" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
      </div>
      <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Salvando…" : "Salvar"}
      </Button>
    </div>
  );
}

function ServicesTab({ barber }: { barber: BarberWithServices }) {
  const queryClient = useQueryClient();
  const servicesQuery = useQuery({ queryKey: ["services", "all"], queryFn: () => listServices() });
  const [enabled, setEnabled] = useState<Set<string>>(new Set(barber.services.map((s) => s.serviceId)));

  const mutation = useMutation({
    mutationFn: () => putBarberServices(barber.id, [...enabled].map((serviceId) => ({ serviceId }))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barbers"] });
      toast.success("Serviços atualizados.");
    },
    onError: () => toast.error("Não foi possível salvar."),
  });

  function toggle(id: string) {
    setEnabled((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 rounded-md border border-border p-2">
        {(servicesQuery.data?.services ?? []).map((service) => (
          <label key={service.id} className="flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={enabled.has(service.id)} onChange={() => toggle(service.id)} className="accent-primary" />
              <span className="text-foreground">{service.name}</span>
            </span>
            <span className="font-mono text-xs text-muted-foreground">{formatMoney(service.priceCents)}</span>
          </label>
        ))}
      </div>
      <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Salvando…" : "Salvar"}
      </Button>
    </div>
  );
}

interface EditableBlock {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

function ScheduleTab({ barberId }: { barberId: string }) {
  const queryClient = useQueryClient();
  const scheduleQuery = useQuery({ queryKey: ["barbers", barberId, "schedule"], queryFn: () => getSchedule(barberId) });
  const [blocks, setBlocks] = useState<EditableBlock[] | null>(null);

  useEffect(() => {
    if (scheduleQuery.data) {
      setBlocks(
        scheduleQuery.data.schedule.map((b) => ({ id: b.id, weekday: b.weekday, startTime: isoTimeToHHmm(b.startTime), endTime: isoTimeToHHmm(b.endTime) })),
      );
    }
  }, [scheduleQuery.data]);

  const mutation = useMutation({
    mutationFn: () => putSchedule(barberId, (blocks ?? []).map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime }))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barbers", barberId, "schedule"] });
      toast.success("Grade atualizada.");
    },
    onError: () => toast.error("Não foi possível salvar — confira se o horário final é depois do inicial."),
  });

  if (!blocks) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  function addBlock(weekday: number) {
    setBlocks((current) => [...(current ?? []), { id: crypto.randomUUID(), weekday, startTime: "09:00", endTime: "18:00" }]);
  }
  function removeBlock(id: string) {
    setBlocks((current) => (current ?? []).filter((b) => b.id !== id));
  }
  function updateBlock(id: string, field: "startTime" | "endTime", value: string) {
    setBlocks((current) => (current ?? []).map((b) => (b.id === id ? { ...b, [field]: value } : b)));
  }

  return (
    <div className="flex flex-col gap-4">
      {WEEKDAYS.map((label, weekday) => (
        <div key={weekday} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>{label}</Label>
            <Button type="button" variant="ghost" size="sm" onClick={() => addBlock(weekday)}>
              + horário
            </Button>
          </div>
          {blocks
            .filter((b) => b.weekday === weekday)
            .map((block) => (
              <div key={block.id} className="flex items-center gap-2">
                <Input
                  type="time"
                  value={block.startTime}
                  onChange={(e) => updateBlock(block.id, "startTime", e.target.value)}
                  className="w-32"
                />
                <span className="text-muted-foreground">até</span>
                <Input
                  type="time"
                  value={block.endTime}
                  onChange={(e) => updateBlock(block.id, "endTime", e.target.value)}
                  className="w-32"
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => removeBlock(block.id)}>
                  Remover
                </Button>
              </div>
            ))}
        </div>
      ))}
      <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Salvando…" : "Salvar grade"}
      </Button>
    </div>
  );
}

function TimeOffTab({ barberId }: { barberId: string }) {
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: () => createTimeOff(barberId, { startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), reason: reason || undefined }),
    onSuccess: () => {
      toast.success("Folga registrada.");
      setStartsAt("");
      setEndsAt("");
      setReason("");
    },
    onError: () => toast.error("Não foi possível registrar a folga."),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="timeOffStart">Início</Label>
        <Input id="timeOffStart" type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="timeOffEnd">Fim</Label>
        <Input id="timeOffEnd" type="datetime-local" required value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="timeOffReason">Motivo (opcional)</Label>
        <Input id="timeOffReason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Registrando…" : "Registrar folga"}
      </Button>
    </form>
  );
}
