import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/** Diálogo genérico com motivo opcional — usado por cancelar e faltou. */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  confirmLabel,
  destructive,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  confirmLabel: string;
  destructive?: boolean;
  isPending: boolean;
  onConfirm: (reason?: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">Motivo (opcional)</Label>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={isPending}
            onClick={() => onConfirm(reason || undefined)}
          >
            {isPending ? "Enviando…" : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
