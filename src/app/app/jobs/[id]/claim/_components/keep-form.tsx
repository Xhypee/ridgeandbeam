"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import type { ActionResult } from "@/components/action-form";

type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

/**
 * Like ActionForm, but never resets what the user typed (React resets form-action forms after
 * every submit, which wipes input when the server rejects it). Disables its controls while saving.
 */
export function KeepForm({ action, children, className }: { action: Action; children: ReactNode; className?: string }) {
  const [state, setState] = useState<ActionResult>(undefined);
  const [pending, start] = useTransition();
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name) fd.set(submitter.name, submitter.value);
    start(async () => setState(await action(undefined, fd)));
  }
  return (
    <form onSubmit={onSubmit} className={className} aria-busy={pending}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state?.error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-full">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 sm:col-span-full">{state.ok}</p>}
    </form>
  );
}
