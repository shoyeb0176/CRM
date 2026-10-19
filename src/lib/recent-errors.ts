import { toast } from "sonner";

// The last few error toasts the user saw, so the assistant can explain what just went wrong.
// Wraps toast.error once when this module loads (the assistant panel imports it).
const MAX = 5;
const errors: string[] = [];

const original = toast.error;
toast.error = ((message: Parameters<typeof toast.error>[0], data?: Parameters<typeof toast.error>[1]) => {
  const text = typeof message === "string" ? message : message instanceof Error ? message.message : null;
  if (text) {
    errors.push(text.slice(0, 300));
    if (errors.length > MAX) errors.shift();
  }
  return original(message, data);
}) as typeof toast.error;

export const recentErrors = () => [...errors];
