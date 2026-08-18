import { z } from "zod";

// `search` (difuso, busca humana no painel) e `phone` (exato, identidade —
// WF-2 do n8n resolvendo quem respondeu no WhatsApp) são mutuamente
// exclusivos de propósito: misturar os dois convidaria a usar o texto livre
// pra identidade, que é exatamente o bug que este parâmetro existe pra evitar
// (ver clients.service.ts#findClientByPhone).
export const searchClientsQuerySchema = z
  .object({
    search: z.string().min(2).max(100).optional(),
    // max bem maior que o de `createClientSchema`: aqui aceita o JID cru que
    // o Evolution manda (`5511999998888@s.whatsapp.net`), não só o telefone
    // como fica salvo — normalização quem faz é `phoneLookupVariants`.
    phone: z.string().min(8).max(50).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .refine((data) => Boolean(data.search) !== Boolean(data.phone), {
    message: "Informe exatamente um entre `search` e `phone`.",
  });
export type SearchClientsQuery = z.infer<typeof searchClientsQuerySchema>;

export const createClientSchema = z.object({
  fullName: z.string().min(1).max(200),
  phone: z.string().min(8).max(20),
  email: z.string().email().optional(),
});
export type CreateClientInput = z.infer<typeof createClientSchema>;
