import { z } from "zod";
import { ALL_EVENT_TYPES } from "./event-types.js";

export const createWebhookEndpointSchema = z.object({
  url: z.string().url(),
  subscribedEvents: z.array(z.enum(ALL_EVENT_TYPES as [string, ...string[]])).min(1),
});
export type CreateWebhookEndpointInput = z.infer<typeof createWebhookEndpointSchema>;

export const updateWebhookEndpointSchema = z.object({
  url: z.string().url().optional(),
  subscribedEvents: z.array(z.enum(ALL_EVENT_TYPES as [string, ...string[]])).min(1).optional(),
  active: z.boolean().optional(),
});
export type UpdateWebhookEndpointInput = z.infer<typeof updateWebhookEndpointSchema>;
