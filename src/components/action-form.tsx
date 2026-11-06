"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

export type ActionResult = { error?: string; ok?: string } | undefined | void;
type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

/** A form bound to a server action that shows the action's error/success message inline. */
export function ActionForm({ action, children, className }: { action: Action; children: ReactNode; className?: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{state.ok}</p>}
    </form>
  );
}

export function SubmitButton({ children, variant, className, name, value, confirm }: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
  name?: string;
  value?: string;
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      className={className}
      disabled={pending}
      name={name}
      value={value}
      onClick={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}
    >
      {pending ? "Saving…" : children}
    </Button>
  );
}
