import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, UserPlus, X } from "lucide-react";
import { createClient, searchClients, type ClientSummary, type CreateClientInput } from "@/lib/api/clients";
import { ApiError } from "@/lib/api/errors";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface ClientPickerProps {
  value: ClientSummary | null;
  onChange: (client: ClientSummary | null) => void;
}

/**
 * Achar-ou-criar cliente — usado no novo agendamento (Agenda) e em
 * qualquer fluxo do Financeiro que precise de um cliente. Busca com
 * debounce; se não achar, abre um formulário mínimo pra cadastrar um
 * walk-in (POST /clients) sem sair da tela.
 */
export function ClientPicker({ value, onChange }: ClientPickerProps) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const searchQuery = useQuery({
    queryKey: ["clients", "search", debounced],
    queryFn: () => searchClients(debounced),
    enabled: debounced.trim().length >= 2 && !value,
  });

  const createMutation = useMutation<ClientSummary, ApiError, CreateClientInput>({
    mutationFn: createClient,
    onSuccess: (client) => {
      queryClient.invalidateQueries({ queryKey: ["clients", "search"] });
      onChange(client);
      setShowCreateForm(false);
      setSearch("");
    },
  });

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border border-input bg-transparent px-3 py-2">
        <div>
          <p className="text-sm font-medium text-foreground">{value.fullName ?? "Sem nome"}</p>
          <p className="text-xs text-muted-foreground">{value.phone}</p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(null)}>
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  if (showCreateForm) {
    return <CreateClientForm onCancel={() => setShowCreateForm(false)} mutation={createMutation} initialPhoneOrName={search} />;
  }

  const results = searchQuery.data?.clients ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Nome ou telefone do cliente"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {debounced.trim().length >= 2 && (
        <div className="overflow-hidden rounded-md border border-border">
          {searchQuery.isLoading ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Buscando…</p>
          ) : results.length > 0 ? (
            <ul>
              {results.map((client) => (
                <li key={client.id}>
                  <button
                    type="button"
                    onClick={() => onChange(client)}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="font-medium text-foreground">{client.fullName ?? "Sem nome"}</span>
                    <span className="text-xs text-muted-foreground">{client.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum cliente encontrado.</div>
          )}
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-primary hover:bg-accent"
          >
            <UserPlus className="size-4" />
            Cadastrar novo cliente
          </button>
        </div>
      )}
    </div>
  );
}

function CreateClientForm({
  onCancel,
  mutation,
  initialPhoneOrName,
}: {
  onCancel: () => void;
  mutation: ReturnType<typeof useMutation<ClientSummary, ApiError, { fullName: string; phone: string; email?: string }>>;
  initialPhoneOrName: string;
}) {
  const looksLikePhone = /\d{4,}/.test(initialPhoneOrName);
  const [fullName, setFullName] = useState(looksLikePhone ? "" : initialPhoneOrName);
  const [phone, setPhone] = useState(looksLikePhone ? initialPhoneOrName : "");
  const [email, setEmail] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    mutation.mutate({ fullName, phone, email: email || undefined });
  }

  const errorMessage =
    mutation.error instanceof ApiError
      ? mutation.error.title === "PHONE_TAKEN"
        ? "Já existe um cliente com esse telefone."
        : mutation.error.title === "EMAIL_TAKEN"
          ? "Já existe um cliente com esse e-mail."
          : "Não foi possível cadastrar."
      : null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium text-foreground">Cadastrar cliente</p>
      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="clientFullName">Nome</Label>
        <Input id="clientFullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="clientPhone">Telefone</Label>
        <Input id="clientPhone" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+5511999999999" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="clientEmail">E-mail (opcional)</Label>
        <Input id="clientEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Cadastrando…" : "Cadastrar"}
        </Button>
      </div>
    </form>
  );
}
