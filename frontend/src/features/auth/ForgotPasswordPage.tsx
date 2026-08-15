import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Scissors } from "lucide-react";
import { forgotPassword } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Sempre a mesma mensagem, exista a conta ou não — o backend responde
  // 202 pros dois casos de propósito (não dá pista de qual e-mail tem
  // login de equipe), então o frontend não pode vazar isso também.
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await forgotPassword(email);
    } catch {
      // mesmo em erro, segue pra mensagem neutra — ver comentário acima
    } finally {
      setIsSubmitting(false);
      setSubmitted(true);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Scissors className="size-7 text-primary" strokeWidth={2} />
          <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">Esqueci minha senha</h1>
        </div>

        <Card>
          <CardContent>
            {submitted ? (
              <p className="text-sm text-muted-foreground">
                Se <strong className="text-foreground">{email}</strong> tiver uma conta de equipe, um link de
                redefinição foi enviado. Confira sua caixa de entrada.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <Button type="submit" disabled={isSubmitting} className="mt-2">
                  {isSubmitting ? "Enviando…" : "Enviar link"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">
            Voltar para o login
          </Link>
        </p>
      </div>
    </div>
  );
}
