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
  // Mesma lógica: um escopo por domínio, com poder equivalente a um ADMIN
  // dentro dele — sem versão mais estreita. Duas exceções deliberadas ficam
  // de fora de qualquer escopo, mesmo com barbers:write: criar/editar/
  // remover a IDENTIDADE do barbeiro (POST/PATCH/DELETE /barbers, que cria
  // credencial de login) e vincular quais serviços um barbeiro faz (PUT
  // /barbers/:id/services) — são decisões de dono, não algo que uma
  // integração deveria conseguir fazer sozinha.
  "barbers:read",
  "barbers:write",
  // Categorias, serviços, produtos (incl. imagens/estoque) e a composição
  // de pacotes (preço/créditos) — tudo que hoje é ADMIN-only por ser
  // definição de catálogo, não movimentação de dinheiro.
  "catalog:write",
  // Leitura: pedidos, relatórios, saldo de fidelidade e de créditos de
  // pacote de um cliente. Escrita: fechar pedido (venda) e vender pacote
  // para um cliente — as duas ações que efetivamente movimentam dinheiro.
  "financeiro:read",
  "financeiro:write",
  // Só leitura — achar um cliente pelo telefone (WF-2, resposta do WhatsApp
  // no n8n). Cadastrar cliente (POST /clients) continua staff-only: é
  // operação de balcão, não algo que um bot deveria fazer sozinho.
  "clients:read",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
