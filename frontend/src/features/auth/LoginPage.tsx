import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Scissors } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { ApiError } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function LoginPage() {
  const { session, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);

  if (session) {
    return <Navigate to="/agenda" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldError(null);
    setBannerError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate("/agenda", { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.title === "INVALID_CREDENTIALS") {
          setFieldError("E-mail ou senha inválidos.");
        } else if (error.title === "ACCOUNT_LOCKED" || error.title === "ACCOUNT_INACTIVE") {
          setBannerError(error.detail ?? "Não foi possível entrar.");
        } else {
          setBannerError(error.detail ?? "Não foi possível entrar. Tente de novo.");
        }
      } else {
        setBannerError("Não foi possível falar com o servidor. Verifique sua conexão.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Scissors className="size-7 text-primary" strokeWidth={2} />
          <h1 className="font-display text-3xl font-medium tracking-tight text-foreground">Prisma</h1>
          <p className="text-sm text-muted-foreground">Painel da equipe</p>
        </div>

        <Card>
          <CardHeader className="sr-only">Entrar</CardHeader>
          <CardContent>
            {bannerError && (
              <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {bannerError}
              </div>
            )}
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  aria-invalid={fieldError ? true : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                />
                {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
              </div>
              <Button type="submit" disabled={isSubmitting} className="mt-2">
                {isSubmitting ? "Entrando…" : "Entrar"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/forgot-password" className="text-primary hover:underline">
            Esqueci minha senha
          </Link>
        </p>
      </div>
    </div>
  );
}
