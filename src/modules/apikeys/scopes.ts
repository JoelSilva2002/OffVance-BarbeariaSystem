/**
 * Catálogo de escopos de API key (docs/ARQUITETURA.md §02: "a chave do n8n
 * nunca deve ter escopo de admin total"). Cresce sob demanda — hoje cobre
 * só as duas rotas que já aceitam API key (ver plugins/auth.ts):
 * GET /events e PATCH /notifications/:id.
 */
export const API_KEY_SCOPES = ["events:read", "notifications:write"] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
