import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, LogOut } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/AuthContext";
import { getMe, updateMe, type UpdateMeInput } from "@/lib/api/me";
import { listBarbers } from "@/lib/api/barbers";
import { getErrorMessage } from "@/lib/api/errors";

const NO_PREFERENCE = "none";

interface FormState {
  fullName: string;
  email: string;
  birthDate: string;
  preferredBarberId: string;
  allergyNotes: string;
  hairNotes: string;
}

export function ProfilePage() {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const { data: barbersData } = useQuery({ queryKey: ["barbers"], queryFn: listBarbers });
  const { logout } = useAuth();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Sincroniza o form local só quando os dados chegam a primeira vez —
  // depois disso o form é a fonte de verdade até salvar (evita sobrescrever
  // o que o cliente está digitando se a query revalidar em background).
  useEffect(() => {
    if (me && !form) {
      setForm({
        fullName: me.fullName ?? "",
        email: me.user.email ?? "",
        birthDate: me.birthDate ?? "",
        preferredBarberId: me.preferredBarberId ?? NO_PREFERENCE,
        allergyNotes: me.allergyNotes ?? "",
        hairNotes: me.hairNotes ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  function updateForm(patch: Partial<FormState>) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function handleSave() {
    if (!form || isSaving) return;
    setIsSaving(true);
    try {
      const input: UpdateMeInput = {
        fullName: form.fullName || undefined,
        email: form.email || null,
        birthDate: form.birthDate || null,
        preferredBarberId: form.preferredBarberId === NO_PREFERENCE ? null : form.preferredBarberId,
        allergyNotes: form.allergyNotes || null,
        hairNotes: form.hairNotes || null,
      };
      await updateMe(input);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Perfil atualizado.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Não foi possível salvar o perfil."));
    } finally {
      setIsSaving(false);
    }
  }

  if (!form) return null;

  return (
    <div className="flex flex-col gap-4 p-4 pb-10">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-primary">Perfil</h1>

      <div className="flex flex-col gap-2">
        <Link to="/perfil/fidelidade">
          <Card className="transition-colors hover:border-primary/40">
            <CardContent className="flex items-center justify-between py-3">
              <span className="text-sm font-medium">Fidelidade</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/perfil/pacotes">
          <Card className="transition-colors hover:border-primary/40">
            <CardContent className="flex items-center justify-between py-3">
              <span className="text-sm font-medium">Pacotes</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">Telefone</Label>
          <Input id="phone" value={me?.user.phone ?? ""} disabled />
          <p className="text-xs text-muted-foreground">
            É a sua identidade de login — trocar de número exige falar com a gente.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="fullName">Nome</Label>
          <Input id="fullName" value={form.fullName} onChange={(e) => updateForm({ fullName: e.target.value })} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => updateForm({ email: e.target.value })}
            placeholder="opcional"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="birthDate">Aniversário</Label>
          <Input
            id="birthDate"
            type="date"
            value={form.birthDate}
            onChange={(e) => updateForm({ birthDate: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="preferredBarber">Barbeiro preferido</Label>
          <Select value={form.preferredBarberId} onValueChange={(value) => updateForm({ preferredBarberId: value })}>
            <SelectTrigger id="preferredBarber" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PREFERENCE}>Sem preferência</SelectItem>
              {(barbersData?.barbers ?? []).map((barber) => (
                <SelectItem key={barber.id} value={barber.id}>
                  {barber.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="allergyNotes">Alergias</Label>
          <Textarea
            id="allergyNotes"
            value={form.allergyNotes}
            onChange={(e) => updateForm({ allergyNotes: e.target.value })}
            maxLength={1000}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="hairNotes">Observações sobre o cabelo</Label>
          <Textarea
            id="hairNotes"
            value={form.hairNotes}
            onChange={(e) => updateForm({ hairNotes: e.target.value })}
            maxLength={1000}
          />
        </div>

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      <Button variant="outline" onClick={() => logout()}>
        <LogOut className="size-4" />
        Sair
      </Button>
    </div>
  );
}
