import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/AuthContext";
import { ApiError } from "@/lib/api/errors";

interface LocationState {
  phone: string;
  expiresAt: string;
  devCode?: string;
}

const RESEND_COOLDOWN_S = 30;

export function CodeEntryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { verifyOtp, requestOtp } = useAuth();
  const state = location.state as LocationState | null;

  // Pré-preenche só em DEV — a API nunca manda `devCode` fora disso, mas o
  // front também não deveria depender desse campo existir em produção.
  const [code, setCode] = useState(import.meta.env.DEV ? (state?.devCode ?? "") : "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // `onComplete` do InputOTP só dispara em digitação de verdade, não quando
  // o valor inicial já chega preenchido (o pré-preenchimento do devCode em
  // DEV) — sem isto, o atalho de dev preenche os 6 dígitos mas não confirma
  // sozinho. `autoSubmittedRef` evita disparar duas vezes no StrictMode.
  useEffect(() => {
    if (import.meta.env.DEV && state?.devCode?.length === 6 && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      void handleVerify(state.devCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navegação direta pra /entrar/codigo sem ter pedido código antes — volta pro início do login.
  if (!state?.phone) {
    return <Navigate to="/entrar" replace />;
  }

  async function handleVerify(value: string) {
    if (value.length !== 6 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await verifyOtp(state!.phone, value);
      navigate("/", { replace: true });
    } catch (error) {
      const message = error instanceof ApiError ? error.detail ?? error.title : "Não foi possível confirmar o código.";
      toast.error(message);
      setCode("");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    try {
      await requestOtp(state!.phone);
      setCooldown(RESEND_COOLDOWN_S);
      toast.success("Código reenviado.");
    } catch (error) {
      const message = error instanceof ApiError ? error.detail ?? error.title : "Não foi possível reenviar o código.";
      toast.error(message);
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background px-6">
      <div className="text-center">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-primary">Prisma</h1>
        <p className="mt-2 text-muted-foreground">Digite o código enviado por WhatsApp</p>
      </div>

      <div className="flex flex-col items-center gap-6">
        <InputOTP
          maxLength={6}
          value={code}
          onChange={setCode}
          onComplete={handleVerify}
          disabled={isSubmitting}
          autoFocus
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>

        <Button variant="ghost" onClick={handleResend} disabled={cooldown > 0}>
          {cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar código"}
        </Button>
      </div>
    </div>
  );
}
