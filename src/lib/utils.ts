import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * For a dialog or sheet's onPointerDownOutside / onInteractOutside: a click on a toast (its "Set up",
 * "Undo" or "Open" button) is not a click outside the dialog, so it doesn't close it mid-click.
 */
export function ignoreToastClicks(e: { target: EventTarget | null; preventDefault: () => void }) {
  if ((e.target as Element | null)?.closest?.("[data-sonner-toaster]")) e.preventDefault();
}
