"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

function Btn({ method, children, primary }: { method: "card" | "becs"; children: React.ReactNode; primary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      name="method"
      value={method}
      disabled={pending}
      className={`min-h-12 w-full rounded-lg px-4 py-3 text-left text-base font-semibold disabled:opacity-60 ${primary ? "bg-brand-500 text-white hover:bg-brand-600" : "bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50"}`}
    >
      {pending ? "Opening secure checkout…" : children}
    </button>
  );
}

export function PayButtons({ token, action, total, becs }: {
  token: string;
  action: (prev: { error?: string } | undefined, fd: FormData) => Promise<{ error?: string } | undefined>;
  total: string;
  becs: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="token" value={token} />
      <Btn method="card" primary>
        Pay {total} by card <span className="block text-xs font-normal opacity-90">Visa, Mastercard, eftpos · no surcharge</span>
      </Btn>
      {becs && (
        <Btn method="becs">
          Pay {total} by direct debit <span className="block text-xs font-normal text-slate-500">BECS Direct Debit from your bank account · takes a few business days</span>
        </Btn>
      )}
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
    </form>
  );
}

/** A bank detail the homeowner can copy with one tap. */
export function CopyValue({ label, value, testId }: { label: string; value: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="break-all font-semibold tabular-nums text-slate-900" data-testid={testId}>{value}</p>
      </div>
      <button
        type="button"
        className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium text-brand-700 ring-1 ring-slate-300 hover:bg-white"
        onClick={async () => {
          try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { window.prompt("Copy:", value); }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
