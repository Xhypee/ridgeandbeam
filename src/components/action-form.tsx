"use client";

import { createContext, startTransition, useActionState, useContext, useRef, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

export type ActionResult = { error?: string; ok?: string } | undefined | void;
type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

const PendingContext = createContext<boolean | null>(null);

/**
 * A form bound to a server action that shows the action's error/success message inline.
 * Submits via onSubmit (not the form `action` prop) so React does not reset the fields —
 * what the user typed stays put when the action returns an error (fields reset only on success).
 */
export function ActionForm({ action, children, className }: { action: Action; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(async (prev, fd) => {
    const res = await action(prev, fd);
    if (!res?.error) ref.current?.reset(); // same as React's built-in reset, but only on success
    return res;
  }, undefined);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(fd));
  };
  return (
    <form ref={ref} onSubmit={onSubmit} className={className}>
      <PendingContext.Provider value={pending}>
      {children}
      {state?.error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{state.ok}</p>}
      </PendingContext.Provider>
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
  const status = useFormStatus();
  const ctx = useContext(PendingContext);
  const pending = ctx ?? status.pending;
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
