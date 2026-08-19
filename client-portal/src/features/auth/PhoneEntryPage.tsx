import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth/AuthContext";
import { ApiError } from "@/lib/api/errors";
import { formatPhoneInput, isValidPhoneInput, toE164BR } from "@/lib/phone";

export function PhoneEntryPage() {
  const [phone, setPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { requestOtp } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidPhoneInput(phone) || isSubmitting) return;

    setIsSubmitting(true);
    const e164 = toE164BR(phone);
    try {
      const { expiresAt, devCode } = await requestOtp(e164);
      navigate("/entrar/codigo", { state: { phone: e164, expiresAt, devCode } });
    } catch (error) {
      // 429 (RATE_LIMITED / OTP_RATE_LIMITED / OTP_DAILY_LIMIT) chega com o
      // detail já pronto em português, incluindo o tempo de espera — não
      // vale a pena reescrever essa mensagem no front.
      const message = error instanceof ApiError ? error.detail ?? error.title : "Não foi possível enviar o código.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background px-6">
      <div className="text-center">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-primary">Prisma</h1>
        <p className="mt-2 text-muted-foreground">Entre com seu número de WhatsApp</p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">Telefone</Label>
          <Input
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="(11) 91234-5678"
            value={phone}
            onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
            autoFocus
          />
        </div>
        <Button type="submit" disabled={!isValidPhoneInput(phone) || isSubmitting}>
          {isSubmitting ? "Enviando..." : "Enviar código"}
        </Button>
      </form>
    </div>
  );
}
