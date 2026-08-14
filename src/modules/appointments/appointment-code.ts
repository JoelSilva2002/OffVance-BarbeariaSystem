import { customAlphabet } from "nanoid";

// sem caracteres ambíguos (0/O, 1/I) — o código vai para o WhatsApp do cliente
const nanoid = customAlphabet("23456789ABCDEFGHJKMNPQRSTUVWXYZ", 6);

export function generateAppointmentCode(): string {
  return `PRX-${nanoid()}`;
}
