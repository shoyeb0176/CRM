import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Every button gets the pointer, a keyboard focus ring and the disabled look. The usual button
// shape (centred row, rounded, text size, icon size) comes with each variant except `bare`, which
// is for buttons with their own layout (sidebar rows, tabs, chips): `variant="bare" size="bare"`.
const shape = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

const buttonVariants = cva(
  "cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        default: `${shape} bg-primary text-primary-foreground shadow hover:bg-primary/90`,
        destructive: `${shape} bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90`,
        outline:
          `${shape} border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground`,
        secondary: `${shape} bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80`,
        ghost: `${shape} hover:bg-accent hover:text-accent-foreground`,
        link: `${shape} text-primary underline-offset-4 hover:underline`,
        // The design kit's two action buttons: a bordered one and a solid one, mono capitals.
        kit: `${shape} border border-border font-mono font-normal text-xs uppercase tracking-widest hover:bg-foreground/5 [&_svg]:size-3.5`,
        kitSolid: `${shape} bg-foreground font-mono font-normal text-xs uppercase tracking-widest text-background hover:bg-primary [&_svg]:size-3.5`,
        bare: "",
      },
      size: {
        default: "h-9 px-4 py-2",
        kit: "px-3 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
        bare: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
