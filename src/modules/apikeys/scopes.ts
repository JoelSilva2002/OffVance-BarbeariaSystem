/**
 * Catálogo de escopos de API key (docs/ARQUITETURA.md §02: "a chave do n8n
 * nunca deve ter escopo de admin total"). Cresce sob demanda conforme as
 * rotas passam a aceitar API key além de sessão de equipe (ver
 * requireStaffOrApiKey em plugins/auth.ts).
 *
 * appointments:write dá à chave o mesmo poder de um ADMIN sobre agendamentos
 * (cria/confirma/cancela/remarca em qualquer agenda) — é o que permite o n8n
 * agir em nome do sistema quando o cliente responde no WhatsApp. Não existe
 * um escopo mais estreito que isso hoje; uma chave que precisa disso confia
 * no mesmo nível de um administrador para essa fatia da API.
 */
export const API_KEY_SCOPES = [
  "events:read",
  "notifications:write",
  "appointments:read",
  "appointments:write",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
