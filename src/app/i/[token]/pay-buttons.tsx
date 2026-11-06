"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

function Btn({ method, children, primary }: { method: "card" | "ach"; children: React.ReactNode; primary?: boolean }) {
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

export function PayButtons({ token, action, card, ach }: {
  token: string;
  action: (prev: { error?: string } | undefined, fd: FormData) => Promise<{ error?: string } | undefined>;
  card: { total: string; note: string };
  ach: { total: string; note: string } | null;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="token" value={token} />
      {ach && (
        <Btn method="ach" primary>
          Pay {ach.total} by bank transfer <span className="block text-xs font-normal opacity-90">{ach.note}</span>
        </Btn>
      )}
      <Btn method="card" primary={!ach}>
        Pay {card.total} by card <span className="block text-xs font-normal opacity-80">{card.note}</span>
      </Btn>
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
