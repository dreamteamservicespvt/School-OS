"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonSize, type ButtonVariant } from "./button";

/** A form's main button: shows it is working and cannot be pressed twice. */
export function SubmitButton({ children, pendingText, variant = "primary", size = "md", className, name, value }: {
  children: React.ReactNode; pendingText?: string; variant?: ButtonVariant; size?: ButtonSize; className?: string; name?: string; value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} loading={pending} loadingText={pendingText} className={className} name={name} value={value}>
      {children}
    </Button>
  );
}
