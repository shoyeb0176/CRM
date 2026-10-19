import { Toaster as Sonner, toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

// Every error toast in the app (about 220 call sites pass raw database or network messages)
// goes through friendlyError here, once, instead of at each call site.
const rawError = toast.error;
toast.error = ((message, data) =>
  rawError(typeof message === "string" ? friendlyError({ message }) : message, data)) as typeof toast.error;

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
