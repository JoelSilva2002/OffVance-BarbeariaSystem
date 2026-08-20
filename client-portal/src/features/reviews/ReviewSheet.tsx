import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createReview } from "@/lib/api/reviews";
import { ApiError } from "@/lib/api/errors";

export function ReviewSheet({ appointmentId, onClose }: { appointmentId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function reset() {
    setRating(0);
    setComment("");
  }

  async function handleSubmit() {
    if (rating === 0 || !appointmentId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await createReview(appointmentId, { rating, comment: comment || undefined });
      await queryClient.invalidateQueries({ queryKey: ["me", "appointments"] });
      toast.success("Avaliação enviada. Obrigado!");
      reset();
      onClose();
    } catch (error) {
      // ALREADY_REVIEWED não deveria acontecer na prática — a UI só mostra
      // o CTA quando `review` é null — mas se acontecer (ex.: duas abas),
      // tratar como sucesso silencioso é mais correto que um erro confuso.
      if (error instanceof ApiError && error.title === "ALREADY_REVIEWED") {
        await queryClient.invalidateQueries({ queryKey: ["me", "appointments"] });
        reset();
        onClose();
        return;
      }
      toast.error(error instanceof ApiError ? (error.detail ?? error.title) : "Não foi possível enviar a avaliação.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Drawer
      open={Boolean(appointmentId)}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose();
        }
      }}
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Como foi seu atendimento?</DrawerTitle>
          <DrawerDescription>Sua avaliação ajuda outros clientes e o barbeiro a melhorar.</DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} estrelas`}>
                <Star
                  className={cn("size-8", value <= rating ? "fill-primary text-primary" : "text-muted-foreground")}
                />
              </button>
            ))}
          </div>

          <Textarea
            placeholder="Conte como foi (opcional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
          />
        </div>

        <DrawerFooter>
          <Button onClick={handleSubmit} disabled={rating === 0 || isSubmitting}>
            {isSubmitting ? "Enviando..." : "Enviar avaliação"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
