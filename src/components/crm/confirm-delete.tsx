import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

type Props = {
  title: string;
  description: string;
  onConfirm: () => void;
  loading?: boolean;
  /** Controlled mode (optional). When omitted, dialog manages its own state and shows a Trash icon button trigger by default. */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  /** Custom trigger element used in uncontrolled mode. */
  trigger?: ReactNode;
  confirmLabel?: string;
  /** Red confirm button (default). Set false for confirmations that don't delete anything. */
  destructive?: boolean;
};

export function ConfirmDelete({
  title, description, onConfirm, loading,
  open, onOpenChange, trigger, confirmLabel = "Delete", destructive = true,
}: Props) {
  const [internal, setInternal] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internal;
  const setOpen = (v: boolean) => { if (isControlled) onOpenChange?.(v); else setInternal(v); };

  const dialog = (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          disabled={loading}
          onClick={(e) => { e.preventDefault(); onConfirm(); setOpen(false); }}
          className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
        >
          {loading ? "Working…" : confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );

  if (isControlled) {
    return <AlertDialog open={isOpen} onOpenChange={setOpen}>{dialog}</AlertDialog>;
  }
  return (
    <AlertDialog open={isOpen} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button aria-label="Delete" size="sm" variant="outline" className="text-muted-foreground hover:text-destructive">
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </AlertDialogTrigger>
      {dialog}
    </AlertDialog>
  );
}
