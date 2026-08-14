/**
 * Erro de negócio no formato RFC 9457 (application/problem+json).
 * `code` é o identificador estável e legível por máquina que consumidores
 * como o n8n devem usar para rotear — nunca o texto de `detail`.
 */
export class Problem extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;

  constructor(status: number, code: string, detail: string) {
    super(detail);
    this.name = "Problem";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }

  toBody(instance?: string) {
    return {
      type: `https://docs.prisma.local/problems/${this.code}`,
      title: this.code,
      status: this.status,
      detail: this.detail,
      ...(instance ? { instance } : {}),
    };
  }
}
